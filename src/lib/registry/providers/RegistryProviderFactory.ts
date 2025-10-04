import type { Repository, RepositoryType } from '@/generated/prisma';
import { EnhancedRegistryProvider } from './base/EnhancedRegistryProvider';

// Import specific providers
import { DockerHubProvider } from './dockerhub/DockerHubProvider';
import { GHCRProvider } from './ghcr/GHCRProvider';
import { GenericOCIProvider } from './generic/GenericOCIProvider';
import { GitLabRegistryHandler } from './gitlab/GitLabRegistryHandler';
import { NexusProvider } from './nexus/NexusProvider';

export class RegistryProviderFactory {
  private static providers = new Map<RepositoryType, new (repository: Repository) => EnhancedRegistryProvider>();
  
  static {
    // Register default providers
    this.register('DOCKERHUB', DockerHubProvider);
    this.register('GHCR', GHCRProvider);
    this.register('GITLAB', GitLabRegistryHandler);
    this.register('GENERIC', GenericOCIProvider);
    this.register('NEXUS', NexusProvider);
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
    // Try provider detection in priority order
    // Each provider's canHandle method determines if it can handle the repository

    if (DockerHubProvider.canHandle(repository)) {
      return new DockerHubProvider(repository);
    }

    if (GHCRProvider.canHandle(repository)) {
      return new GHCRProvider(repository);
    }

    if (GitLabRegistryHandler.canHandle(repository)) {
      return new GitLabRegistryHandler(repository);
    }

    if (NexusProvider.canHandle(repository)) {
      return new NexusProvider(repository);
    }

    // GenericOCIProvider is the fallback for any other registry
    if (GenericOCIProvider.canHandle(repository)) {
      return new GenericOCIProvider(repository);
    }

    // If no provider can handle it, use the registered provider or throw
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
   * Each provider handles its own validation logic
   */
  static validateConfiguration(repository: Repository): { valid: boolean; errors: string[] } {
    try {
      // Create the appropriate provider and use its validation
      const provider = this.createFromRepository(repository);
      return provider.validateConfiguration();
    } catch (error) {
      // If provider creation fails, return an error
      return {
        valid: false,
        errors: [`Failed to validate configuration: ${error instanceof Error ? error.message : 'Unknown error'}`]
      };
    }
  }
}