import type { Repository, RepositoryType } from '@/generated/prisma';
import { EnhancedRegistryProvider } from './base/EnhancedRegistryProvider';

// Import specific providers
import { DockerHubProvider } from './dockerhub/DockerHubProvider';
import { GHCRProvider } from './ghcr/GHCRProvider';
import { GenericOCIProvider } from './generic/GenericOCIProvider';
import { GitLabRegistryHandler } from './gitlab/GitLabRegistryHandler';

export class RegistryProviderFactory {
  private static providers = new Map<RepositoryType, new (repository: Repository) => EnhancedRegistryProvider>();
  
  static {
    // Register default providers
    this.register('DOCKERHUB', DockerHubProvider);
    this.register('GHCR', GHCRProvider);
    this.register('GITLAB', GitLabRegistryHandler);
    this.register('GENERIC', GenericOCIProvider);
  }
  
  /**
   * Register a new provider for a repository type
   */
  static register(type: RepositoryType, provider: new (repository: Repository) => EnhancedRegistryProvider): void {
    this.providers.set(type, provider);
  }
  
  /**
   * Create a provider instance for the given repository
   */
  static create(type: RepositoryType, repository: Repository): EnhancedRegistryProvider {
    const ProviderClass = this.providers.get(type);
    if (!ProviderClass) {
      throw new Error(`No provider registered for registry type: ${type}`);
    }
    return new ProviderClass(repository);
  }
  
  /**
   * Create a provider instance directly from repository (uses repository.type)
   */
  static createFromRepository(repository: Repository): EnhancedRegistryProvider {
    // Check for special cases based on registry URL if type is GENERIC
    if (repository.type === 'GENERIC') {
      // Auto-detect GitLab
      if (repository.registryUrl?.includes('gitlab') || repository.authUrl?.includes('/jwt/auth')) {
        return new GitLabRegistryHandler(repository);
      }
      
      // Auto-detect GHCR
      if (repository.registryUrl?.includes('ghcr.io')) {
        return new GHCRProvider(repository);
      }
    }
    
    // Direct type mapping
    if (repository.type === 'GITLAB') {
      return new GitLabRegistryHandler(repository);
    }
    
    if (repository.type === 'GHCR') {
      return new GHCRProvider(repository);
    }
    
    return this.create(repository.type, repository);
  }
  
  /**
   * Get all supported registry types
   */
  static getSupportedTypes(): RepositoryType[] {
    return Array.from(this.providers.keys());
  }
  
  /**
   * Check if a registry type is supported
   */
  static isSupported(type: RepositoryType): boolean {
    return this.providers.has(type);
  }
  
  /**
   * Get provider information for all supported types
   */
  static getProviderInfo(): Array<{
    type: RepositoryType;
    name: string;
    capabilities: string[];
  }> {
    return Array.from(this.providers.entries()).map(([type, ProviderClass]) => {
      // Create a temporary repository object to instantiate provider
      const tempRepo: Repository = {
        id: '',
        name: '',
        type,
        protocol: 'https',
        registryUrl: '',
        username: '',
        encryptedPassword: '',
        organization: null,
        status: 'UNTESTED',
        lastTested: null,
        repositoryCount: null,
        apiVersion: null,
        authUrl: null,
        groupId: null,
        skipTlsVerify: false,
        registryPort: null,
        capabilities: null,
        rateLimits: null,
        healthCheck: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      try {
        const provider = new ProviderClass(tempRepo);
        return {
          type,
          name: provider.getProviderName(),
          capabilities: provider.getSupportedCapabilities()
        };
      } catch {
        return {
          type,
          name: 'Unknown Provider',
          capabilities: []
        };
      }
    });
  }
  
  /**
   * Validate that required configuration is present for a repository type
   */
  static validateConfiguration(repository: Repository): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Common validations
    if (!repository.username?.trim()) {
      errors.push('Username is required');
    }
    
    if (!repository.encryptedPassword?.trim()) {
      errors.push('Password/Token is required');
    }
    
    // Type-specific validations
    switch (repository.type) {
      case 'GENERIC':
        if (!repository.registryUrl?.trim()) {
          errors.push('Registry URL is required for generic repositories');
        }
        break;
        
      case 'DOCKERHUB':
        // Docker Hub specific validations
        break;
        
      case 'GHCR':
        // GHCR specific validations
        if (!repository.encryptedPassword?.startsWith('ghp_') && !repository.encryptedPassword?.startsWith('ghs_')) {
          errors.push('GHCR requires a GitHub Personal Access Token (PAT) starting with ghp_ or ghs_');
        }
        break;
        
      case 'GITLAB':
        // GitLab Registry specific validations
        if (!repository.registryUrl?.trim()) {
          errors.push('Registry URL is required for GitLab Registry');
        }
        // authUrl is optional as it can be derived from registryUrl
        break;
        
      default:
        if (!this.isSupported(repository.type)) {
          errors.push(`Unsupported repository type: ${repository.type}`);
        }
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}