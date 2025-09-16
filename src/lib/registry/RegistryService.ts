import { PrismaClient, type Repository } from '@/generated/prisma';
import { RegistryProviderFactory } from './providers/RegistryProviderFactory';
import { RegistryMetadataCache } from './cache/RegistryMetadataCache';
import type { 
  RegistryImage, 
  ImageTag, 
  ImageMetadata, 
  ConnectionTestResult,
  ListImagesOptions,
  SearchOptions 
} from './types';

export class RegistryService {
  private prisma: PrismaClient;
  private cache: RegistryMetadataCache;
  
  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.cache = new RegistryMetadataCache(prisma);
  }
  
  async listImages(
    repositoryId: string, 
    options: ListImagesOptions & { forceRefresh?: boolean } = {}
  ): Promise<RegistryImage[]> {
    const repository = await this.getRepositoryById(repositoryId);
    return this.cache.listImages(repository, options);
  }
  
  async getImageMetadata(
    repositoryId: string,
    namespace: string | null,
    imageName: string,
    options: { forceRefresh?: boolean } = {}
  ): Promise<ImageMetadata> {
    const repository = await this.getRepositoryById(repositoryId);
    return this.cache.getImageMetadata(repository, namespace, imageName, options);
  }
  
  async getTags(
    repositoryId: string,
    namespace: string | null,
    imageName: string,
    options: { forceRefresh?: boolean } = {}
  ): Promise<ImageTag[]> {
    const repository = await this.getRepositoryById(repositoryId);
    return this.cache.getTags(repository, namespace, imageName, options);
  }
  
  async searchImages(
    repositoryId: string,
    query: string,
    options: SearchOptions & { forceRefresh?: boolean } = {}
  ): Promise<RegistryImage[]> {
    const repository = await this.getRepositoryById(repositoryId);
    
    const provider = RegistryProviderFactory.createFromRepository(repository);
    if (!provider.getSupportedCapabilities().includes('SEARCH')) {
      throw new Error(`Search not supported by ${provider.getProviderName()}`);
    }
    
    return this.cache.searchImages(repository, query, options);
  }
  
  async testConnection(repositoryId: string): Promise<ConnectionTestResult & { repositoryCount?: number }> {
    console.log('[RegistryService] Testing connection for repository:', repositoryId);
    const repository = await this.getRepositoryById(repositoryId);
    console.log('[RegistryService] Repository found:', {
      id: repository.id,
      type: repository.type,
      registryUrl: repository.registryUrl,
      skipTlsVerify: repository.skipTlsVerify,
      registryPort: repository.registryPort
    });
    
    const provider = RegistryProviderFactory.createFromRepository(repository);
    console.log('[RegistryService] Provider created:', provider.getProviderName());
    
    try {
      const result = await provider.testConnection();
      console.log('[RegistryService] Test result:', result);
      
      // Update repository status in database
      await this.prisma.repository.update({
        where: { id: repositoryId },
        data: {
          status: result.success ? 'ACTIVE' : 'ERROR',
          lastTested: new Date(),
          repositoryCount: result.repositoryCount ?? null
        }
      });
      
      // If successful, warm up the cache
      if (result.success) {
        await this.cache.warmupCache(repository);
      }
      
      return result;
    } catch (error) {
      // Update repository status to error
      await this.prisma.repository.update({
        where: { id: repositoryId },
        data: {
          status: 'ERROR',
          lastTested: new Date()
        }
      });
      
      throw error;
    }
  }
  
  async validateRepositoryConfiguration(repository: Repository): Promise<{ valid: boolean; errors: string[] }> {
    return RegistryProviderFactory.validateConfiguration(repository);
  }
  
  async getProviderInfo() {
    return RegistryProviderFactory.getProviderInfo();
  }
  
  async getSupportedRegistryTypes() {
    return RegistryProviderFactory.getSupportedTypes();
  }
  
  async invalidateCache(repositoryId: string, operation?: string): Promise<void> {
    return this.cache.invalidateCache(repositoryId, operation);
  }
  
  async getProviderCapabilities(repositoryId: string): Promise<string[]> {
    const repository = await this.getRepositoryById(repositoryId);
    const provider = RegistryProviderFactory.createFromRepository(repository);
    return provider.getSupportedCapabilities();
  }
  
  async getProviderRateLimits(repositoryId: string) {
    const repository = await this.getRepositoryById(repositoryId);
    const provider = RegistryProviderFactory.createFromRepository(repository);
    return provider.getRateLimits();
  }
  
  async getProviderHealthStatus(repositoryId: string) {
    const repository = await this.getRepositoryById(repositoryId);
    const provider = RegistryProviderFactory.createFromRepository(repository);
    return provider.getHealthStatus();
  }
  
  // Helper methods
  private async getRepositoryById(repositoryId: string): Promise<Repository> {
    const repository = await this.prisma.repository.findUnique({
      where: { id: repositoryId }
    });
    
    if (!repository) {
      throw new Error(`Repository not found: ${repositoryId}`);
    }
    
    return repository;
  }
  
  // Direct provider access (for advanced use cases)
  async getProvider(repositoryId: string) {
    const repository = await this.getRepositoryById(repositoryId);
    return RegistryProviderFactory.createFromRepository(repository);
  }
  
  // Batch operations
  async testAllConnections(): Promise<Array<{ repositoryId: string; result: ConnectionTestResult }>> {
    const repositories = await this.prisma.repository.findMany({
      where: { status: { not: 'ERROR' } }
    });
    
    const results = [];
    
    for (const repository of repositories) {
      try {
        const result = await this.testConnection(repository.id);
        results.push({ repositoryId: repository.id, result });
      } catch (error) {
        results.push({
          repositoryId: repository.id,
          result: {
            success: false,
            message: error instanceof Error ? error.message : 'Unknown error',
            error: error instanceof Error ? error : new Error('Unknown error')
          }
        });
      }
    }
    
    return results;
  }
  
  async syncAllRepositoryMetadata(): Promise<void> {
    const repositories = await this.prisma.repository.findMany({
      where: { status: 'ACTIVE' }
    });
    
    await Promise.allSettled(
      repositories.map(async (repository: any) => {
        try {
          await this.cache.warmupCache(repository);
        } catch (error) {
          console.warn(`Failed to sync metadata for repository ${repository.name}:`, error);
        }
      })
    );
  }
  
  // Cleanup operations
  async cleanupExpiredCache(): Promise<void> {
    return this.cache.cleanupExpiredCache();
  }
  
  getCacheStats() {
    return this.cache.getCacheStats();
  }
  
  // Repository creation with validation and testing
  async createRepository(data: {
    name: string;
    type: string;
    registryUrl?: string;
    username: string;
    password: string;
    organization?: string;
    protocol?: string;
    skipTlsVerify?: boolean;
    testConnection?: boolean;
  }): Promise<{ repository: Repository; testResult?: ConnectionTestResult }> {
    const { testConnection = true, ...repositoryData } = data;
    
    // Validate type
    const supportedTypes = RegistryProviderFactory.getSupportedTypes();
    const upperType = repositoryData.type.toUpperCase() as any;
    
    if (!supportedTypes.includes(upperType)) {
      throw new Error(`Unsupported repository type: ${repositoryData.type}`);
    }
    
    // Process registry URL and protocol
    let protocol = repositoryData.protocol || 'https';
    let cleanRegistryUrl = repositoryData.registryUrl || '';
    
    if (upperType === 'DOCKERHUB') {
      cleanRegistryUrl = 'docker.io';
    } else if (upperType === 'GHCR') {
      cleanRegistryUrl = 'ghcr.io';
    }
    
    if (cleanRegistryUrl) {
      // Remove protocol from URL if present
      if (cleanRegistryUrl.startsWith('http://')) {
        if (!repositoryData.protocol) protocol = 'http';
        cleanRegistryUrl = cleanRegistryUrl.substring(7);
      } else if (cleanRegistryUrl.startsWith('https://')) {
        if (!repositoryData.protocol) protocol = 'https';
        cleanRegistryUrl = cleanRegistryUrl.substring(8);
      }
      cleanRegistryUrl = cleanRegistryUrl.replace(/\/$/, '');
    }
    
    // Create repository object for validation
    const repositoryForValidation: Repository = {
      id: '',
      name: repositoryData.name,
      type: upperType,
      protocol,
      registryUrl: cleanRegistryUrl,
      username: repositoryData.username,
      encryptedPassword: repositoryData.password, // TODO: encrypt in production
      organization: repositoryData.organization || null,
      authUrl: null,
      groupId: null,
      skipTlsVerify: repositoryData.skipTlsVerify || false,
      registryPort: null,
      status: 'UNTESTED',
      lastTested: null,
      repositoryCount: null,
      apiVersion: null,
      capabilities: null,
      rateLimits: null,
      healthCheck: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    // Validate configuration
    const validation = RegistryProviderFactory.validateConfiguration(repositoryForValidation);
    if (!validation.valid) {
      throw new Error(`Invalid repository configuration: ${validation.errors.join(', ')}`);
    }
    
    let status: 'ACTIVE' | 'ERROR' | 'UNTESTED' = 'UNTESTED';
    let repositoryCount: number | null = null;
    let lastTested: Date | null = null;
    let testResult: ConnectionTestResult | undefined;
    
    // Test connection if requested
    if (testConnection) {
      try {
        const provider = RegistryProviderFactory.create(upperType, repositoryForValidation);
        testResult = await provider.testConnection();
        
        if (testResult.success) {
          status = 'ACTIVE';
          repositoryCount = testResult.repositoryCount ?? null;
          lastTested = new Date();
        } else {
          status = 'ERROR';
          lastTested = new Date();
        }
      } catch (error) {
        status = 'ERROR';
        lastTested = new Date();
        testResult = {
          success: false,
          message: error instanceof Error ? error.message : 'Connection test failed',
          error: error instanceof Error ? error : new Error('Connection test failed')
        };
      }
    }
    
    // Check if repository with same registryUrl and username already exists
    const existingRepository = await this.prisma.repository.findFirst({
      where: {
        registryUrl: cleanRegistryUrl,
        username: repositoryData.username
      }
    });
    
    if (existingRepository) {
      // Update existing repository instead of creating a new one
      const repository = await this.prisma.repository.update({
        where: { id: existingRepository.id },
        data: {
          name: repositoryData.name,
          type: upperType,
          protocol,
          encryptedPassword: repositoryData.password, // TODO: encrypt
          organization: repositoryData.organization || null,
          skipTlsVerify: repositoryData.skipTlsVerify || false,
          status,
          repositoryCount,
          lastTested
        }
      });
      
      console.log(`Updated existing repository: ${repository.id}`);
      
      // Warm up cache if connection was successful
      if (status === 'ACTIVE') {
        try {
          await this.cache.warmupCache(repository);
        } catch (error) {
          console.warn('Failed to warm up cache for updated repository:', error);
        }
      }
      
      return { repository, testResult };
    }
    
    // Create new repository
    const repository = await this.prisma.repository.create({
      data: {
        name: repositoryData.name,
        type: upperType,
        protocol,
        registryUrl: cleanRegistryUrl,
        username: repositoryData.username,
        encryptedPassword: repositoryData.password, // TODO: encrypt
        organization: repositoryData.organization || null,
        skipTlsVerify: repositoryData.skipTlsVerify || false,
        status,
        repositoryCount,
        lastTested
      }
    });
    
    // Warm up cache if connection was successful
    if (status === 'ACTIVE') {
      try {
        await this.cache.warmupCache(repository);
      } catch (error) {
        console.warn('Failed to warm up cache for new repository:', error);
      }
    }
    
    return { repository, testResult };
  }

  // Repository management methods
  async listRepositories(options: {
    includeInactive?: boolean;
    orderBy?: 'name' | 'createdAt' | 'status';
    orderDirection?: 'asc' | 'desc';
  } = {}) {
    const { includeInactive = true, orderBy = 'createdAt', orderDirection = 'desc' } = options;

    return this.prisma.repository.findMany({
      where: includeInactive ? undefined : { status: { not: 'ERROR' } },
      select: {
        id: true,
        name: true,
        type: true,
        protocol: true,
        registryUrl: true,
        username: true,
        lastTested: true,
        status: true,
        repositoryCount: true,
        createdAt: true,
        skipTlsVerify: true,
        registryPort: true,
      },
      orderBy: {
        [orderBy]: orderDirection,
      },
    });
  }

  async deleteRepository(repositoryId: string): Promise<void> {
    // Clean up cache first
    await this.invalidateCache(repositoryId);
    
    // Delete repository
    await this.prisma.repository.delete({
      where: { id: repositoryId }
    });
  }

  async updateRepository(
    repositoryId: string,
    data: Partial<{
      name: string;
      username: string;
      password: string;
      organization?: string;
      registryUrl?: string;
    }>
  ): Promise<Repository> {
    const updateData: any = {};
    
    if (data.name) updateData.name = data.name;
    if (data.username) updateData.username = data.username;
    if (data.password) updateData.encryptedPassword = data.password; // TODO: encrypt
    if (data.organization !== undefined) updateData.organization = data.organization || null;
    if (data.registryUrl) updateData.registryUrl = data.registryUrl;
    
    updateData.updatedAt = new Date();

    // Invalidate cache since credentials or URL might have changed
    await this.invalidateCache(repositoryId);

    return this.prisma.repository.update({
      where: { id: repositoryId },
      data: updateData
    });
  }

  // Helper method to get repository credentials for external use (e.g., scanning, image export)
  async getRepositoryCredentials(repositoryId: string): Promise<{
    username: string;
    password: string;
    registryUrl: string;
  } | null> {
    const repository = await this.getRepositoryById(repositoryId);
    
    if (repository.status !== 'ACTIVE') {
      return null;
    }

    return {
      username: repository.username,
      password: repository.encryptedPassword, // TODO: decrypt in production
      registryUrl: repository.registryUrl
    };
  }
}