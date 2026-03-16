import { PrismaClient, Repository, RepositoryType, RepositoryStatus } from '@/generated/prisma';
import { logger } from '@/lib/logger';

export interface RepositoryCredentials {
  username: string;
  password: string;
}

export interface RepositoryWithAuth extends Repository {
  credentials?: RepositoryCredentials;
}

/**
 * Centralized service for all repository-related operations
 */
export class RepositoryService {
  private static instance: RepositoryService;
  
  constructor(private prisma: PrismaClient) {}
  
  /**
   * Get singleton instance
   */
  static getInstance(prisma: PrismaClient): RepositoryService {
    if (!RepositoryService.instance) {
      RepositoryService.instance = new RepositoryService(prisma);
    }
    return RepositoryService.instance;
  }
  
  /**
   * Get a repository by ID
   */
  async getById(id: string): Promise<Repository | null> {
    try {
      return await this.prisma.repository.findUnique({
        where: { id }
      });
    } catch (error) {
      logger.error(`Failed to get repository ${id}:`, error);
      return null;
    }
  }
  
  /**
   * Get an active repository by ID
   */
  async getActiveById(id: string): Promise<Repository | null> {
    try {
      return await this.prisma.repository.findFirst({
        where: { 
          id,
          status: 'ACTIVE'
        }
      });
    } catch (error) {
      logger.error(`Failed to get active repository ${id}:`, error);
      return null;
    }
  }
  
  /**
   * Get repository with decrypted credentials
   */
  async getWithCredentials(id: string): Promise<RepositoryWithAuth | null> {
    const repository = await this.getActiveById(id);
    if (!repository) return null;
    
    // TODO: Implement proper credential decryption
    // For now, returning plain text (should be encrypted in production)
    return {
      ...repository,
      credentials: repository.username && repository.encryptedPassword ? {
        username: repository.username,
        password: repository.encryptedPassword // Should decrypt here
      } : undefined
    };
  }
  
  /**
   * Get all active repositories
   */
  async getAllActive(): Promise<Repository[]> {
    try {
      return await this.prisma.repository.findMany({
        where: { status: 'ACTIVE' }
      });
    } catch (error) {
      logger.error('Failed to get active repositories:', error);
      return [];
    }
  }
  
  /**
   * Find repository by registry URL
   */
  async findByRegistryUrl(registryUrl: string): Promise<Repository | null> {
    try {
      return await this.prisma.repository.findFirst({
        where: { 
          registryUrl,
          status: 'ACTIVE'
        }
      });
    } catch (error) {
      logger.error(`Failed to find repository by URL ${registryUrl}:`, error);
      return null;
    }
  }
  
  /**
   * Find repository that might contain the given image
   */
  async findForImage(imageName: string): Promise<Repository | null> {
    try {
      // First, check if image has a registry prefix
      if (imageName.includes('/')) {
        const parts = imageName.split('/');
        if (parts[0].includes(':') || parts[0].includes('.')) {
          // Looks like a registry URL prefix
          const repository = await this.findByRegistryUrl(parts[0]);
          if (repository) return repository;
        }
      }
      
      // Check repository images for a match
      const repoImage = await this.prisma.repositoryImage.findFirst({
        where: {
          imageName: {
            contains: imageName
          }
        },
        include: {
          repository: true
        }
      });
      
      if (repoImage?.repository && repoImage.repository.status === 'ACTIVE') {
        return repoImage.repository;
      }
      
      // If image looks private (has namespace), try to find a matching private registry
      if (imageName.includes('/') && !imageName.startsWith('library/')) {
        const privateRepos = await this.getAllActive();
        // Prefer repositories that have successfully scanned this image before
        for (const repo of privateRepos) {
          if (repo.type === 'GENERIC' || repo.type === 'GHCR' || repo.type === 'ECR') {
            return repo; // Return first private registry as a fallback
          }
        }
      }
      
      return null;
    } catch (error) {
      logger.error(`Failed to find repository for image ${imageName}:`, error);
      return null;
    }
  }
  
  
  /**
   * Get registry URL for a repository or image
   */
  async getRegistryUrl(repositoryId?: string, imageName?: string): Promise<string | null> {
    if (repositoryId) {
      const repository = await this.getActiveById(repositoryId);
      if (repository) return repository.registryUrl;
    }
    
    if (imageName) {
      const repository = await this.findForImage(imageName);
      if (repository) return repository.registryUrl;
    }
    
    return null;
  }
  
  /**
   * Update repository status
   */
  async updateStatus(id: string, status: RepositoryStatus, error?: string): Promise<void> {
    try {
      await this.prisma.repository.update({
        where: { id },
        data: {
          status,
          lastTested: new Date()
        }
      });
    } catch (error) {
      logger.error(`Failed to update repository ${id} status:`, error);
    }
  }
  
  /**
   * Update repository count
   */
  async updateRepositoryCount(id: string, count: number): Promise<void> {
    try {
      await this.prisma.repository.update({
        where: { id },
        data: { repositoryCount: count }
      });
    } catch (error) {
      logger.error(`Failed to update repository ${id} count:`, error);
    }
  }
  
}