import type { Repository } from '@/generated/prisma';
import { EnhancedRegistryProvider } from '../base/EnhancedRegistryProvider';
import type {
  GHCRConfig,
  RegistryImage,
  ImageTag,
  ImageMetadata,
  ConnectionTestResult,
  ListImagesOptions,
  SearchOptions,
  RegistryCapability,
  RateLimit
} from '../../types';
import { logger } from '@/lib/logger';

export class GHCRProvider extends EnhancedRegistryProvider {
  protected config: GHCRConfig;
  
  constructor(repository: Repository) {
    super(repository);
    this.config = this.parseConfig(repository) as GHCRConfig;
  }
  
  getProviderName(): string {
    return 'GitHub Container Registry';
  }
  
  getSupportedCapabilities(): RegistryCapability[] {
    return ['LIST_IMAGES', 'GET_TAGS', 'GET_METADATA', 'DELETE_IMAGES'];
  }
  
  getRateLimits(): RateLimit {
    return {
      requestsPerHour: 5000, // GitHub API has high limits for authenticated requests
      requestsPerMinute: 80,
      burstLimit: 100
    };
  }
  
  protected parseConfig(repository: Repository): GHCRConfig {
    return {
      username: repository.username || '',
      token: repository.encryptedPassword || '', // TODO: decrypt in production
      organization: repository.organization || undefined,
      apiBaseUrl: 'https://api.github.com'
    };
  }
  
  async getAuthHeaders(): Promise<Record<string, string>> {
    // Public repos don't require auth for read operations
    if (!this.config.token) {
      return {
        'Accept': 'application/vnd.github.v3+json'
      };
    }
    return {
      'Authorization': `Bearer ${this.config.token}`,
      'Accept': 'application/vnd.github.v3+json'
    };
  }
  
  async getSkopeoAuthArgs(): Promise<string> {
    // GitHub Container Registry uses PAT for authentication
    // Public repos don't require auth
    if (!this.config.username || !this.config.token) {
      return '';
    }
    const escapedUsername = this.config.username.replace(/"/g, '\\"');
    const escapedToken = this.config.token.replace(/"/g, '\\"');
    return `--creds "${escapedUsername}:${escapedToken}"`;
  }
  
  async listImages(options: ListImagesOptions = {}): Promise<RegistryImage[]> {
    await this.handleRateLimit();
    
    const images: RegistryImage[] = [];
    const limit = Math.min(options.limit || 100, 100);
    
    // Get user packages
    try {
      const userPackages = await this.getUserPackages(limit, options.offset);
      images.push(...userPackages);
    } catch (error) {
      console.warn('Failed to fetch user packages:', error);
    }
    
    // Get organization packages if specified
    if (this.config.organization) {
      try {
        const orgPackages = await this.getOrganizationPackages(this.config.organization, limit, options.offset);
        images.push(...orgPackages);
      } catch (error) {
        console.warn('Failed to fetch organization packages:', error);
      }
    }
    
    // Apply query filter if provided
    if (options.query) {
      return images.filter(image => 
        image.name.toLowerCase().includes(options.query!.toLowerCase()) ||
        image.description?.toLowerCase().includes(options.query!.toLowerCase())
      );
    }
    
    return images;
  }
  
  private async getUserPackages(limit: number, offset?: number): Promise<RegistryImage[]> {
    const page = offset ? Math.floor(offset / limit) + 1 : 1;
    const url = `${this.config.apiBaseUrl}/user/packages?package_type=container&per_page=${limit}&page=${page}`;
    
    this.logRequest('GET', url);
    const response = await this.makeAuthenticatedRequest(url);
    const packages = await response.json();
    
    return packages.map((pkg: any) => ({
      namespace: this.config.username,
      name: pkg.name,
      fullName: `${this.config.username}/${pkg.name}`,
      description: pkg.description || undefined,
      isPrivate: pkg.visibility === 'private',
      starCount: undefined, // GHCR doesn't provide star counts
      pullCount: undefined,
      lastUpdated: this.formatDate(pkg.updated_at)
    }));
  }
  
  private async getOrganizationPackages(organization: string, limit: number, offset?: number): Promise<RegistryImage[]> {
    const page = offset ? Math.floor(offset / limit) + 1 : 1;
    const url = `${this.config.apiBaseUrl}/orgs/${organization}/packages?package_type=container&per_page=${limit}&page=${page}`;
    
    this.logRequest('GET', url);
    const response = await this.makeAuthenticatedRequest(url);
    const packages = await response.json();
    
    return packages.map((pkg: any) => ({
      namespace: organization,
      name: pkg.name,
      fullName: `${organization}/${pkg.name}`,
      description: pkg.description || undefined,
      isPrivate: pkg.visibility === 'private',
      starCount: undefined,
      pullCount: undefined,
      lastUpdated: this.formatDate(pkg.updated_at)
    }));
  }
  
  async getImageMetadata(namespace: string | null, imageName: string): Promise<ImageMetadata> {
    await this.handleRateLimit();
    
    const owner = namespace || this.config.username;
    const url = `${this.config.apiBaseUrl}/${this.config.organization ? 'orgs' : 'users'}/${owner}/packages/container/${imageName}`;
    
    this.logRequest('GET', url);
    const response = await this.makeAuthenticatedRequest(url);
    const pkg = await response.json();
    
    // Get tags as well
    const tags = await this.getTags(namespace, imageName);
    
    return {
      namespace,
      name: imageName,
      description: pkg.description || undefined,
      isPrivate: pkg.visibility === 'private',
      starCount: undefined,
      pullCount: undefined,
      lastUpdated: this.formatDate(pkg.updated_at),
      tags
    };
  }
  
  async getTags(namespace: string | null, imageName: string): Promise<ImageTag[]> {
    await this.handleRateLimit();
    
    // GHCR uses the Docker Registry v2 API directly for tags
    const owner = namespace || this.config.username;
    const registryUrl = `https://ghcr.io/v2/${owner}/${imageName}/tags/list`;
    
    this.logRequest('GET', registryUrl);
    
    try {
      // Use Docker Registry API for tags
      const response = await fetch(registryUrl, {
        headers: {
          'Authorization': `Bearer ${this.config.token}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      return (data.tags || []).map((tag: string) => ({
        name: tag,
        size: 0,
        created: undefined,
        lastModified: undefined,
        digest: null,
        platform: undefined
      }));
    } catch (error) {
      // Fallback to GitHub API for package versions
      return this.getTagsFromGitHubAPI(namespace, imageName);
    }
  }
  
  private async getTagsFromGitHubAPI(namespace: string | null, imageName: string): Promise<ImageTag[]> {
    const owner = namespace || this.config.username;
    const url = `${this.config.apiBaseUrl}/${this.config.organization ? 'orgs' : 'users'}/${owner}/packages/container/${imageName}/versions`;
    
    this.logRequest('GET', url);
    const response = await this.makeAuthenticatedRequest(url);
    const versions = await response.json();
    
    return versions
      .filter((version: any) => version.metadata?.container?.tags?.length > 0)
      .flatMap((version: any) => 
        version.metadata.container.tags.map((tag: string) => ({
          name: tag,
          size: version.metadata?.container?.size || 0,
          created: this.formatDate(version.updated_at),
          lastModified: this.formatDate(version.updated_at),
          digest: version.name || null, // GitHub uses version name as digest
          platform: undefined
        }))
      );
  }
  
  async searchImages(query: string, options: SearchOptions = {}): Promise<RegistryImage[]> {
    // GHCR doesn't have a direct search API, so we'll search through accessible packages
    const allImages = await this.listImages({ limit: 100 });
    
    return allImages.filter(image => {
      const matchesQuery = image.name.toLowerCase().includes(query.toLowerCase()) ||
                          image.description?.toLowerCase().includes(query.toLowerCase());
      return matchesQuery;
    }).slice(options.offset || 0, (options.offset || 0) + (options.limit || 25));
  }
  
  async deleteImage(image: string, tag: string): Promise<void> {
    const { namespace, imageName } = this.parseImageName(image);
    await this.handleRateLimit();
    
    // First, find the version ID for this tag
    const versions = await this.getTagsFromGitHubAPI(namespace, imageName);
    const targetVersion = versions.find(v => v.name === tag);
    
    if (!targetVersion || !targetVersion.digest) {
      throw new Error(`Tag ${tag} not found for image ${imageName}`);
    }
    
    const owner = namespace || this.config.username;
    const url = `${this.config.apiBaseUrl}/${this.config.organization ? 'orgs' : 'users'}/${owner}/packages/container/${imageName}/versions/${targetVersion.digest}`;
    
    this.logRequest('DELETE', url);
    const response = await this.makeAuthenticatedRequest(url, { method: 'DELETE' });
    
    if (!response.ok) {
      throw new Error(`Failed to delete image: HTTP ${response.status}`);
    }
  }
  
  async testConnection(): Promise<ConnectionTestResult> {
    try {
      // Test by accessing user info
      const userUrl = `${this.config.apiBaseUrl}/user`;
      this.logRequest('GET', userUrl);
      const response = await this.makeAuthenticatedRequest(userUrl);
      const userData = await response.json();
      
      // Try to list packages to verify access
      try {
        const images = await this.listImages({ limit: 1 });
        return {
          success: true,
          message: `Successfully connected to GHCR as ${userData.login}`,
          repositoryCount: images.length,
          capabilities: this.getSupportedCapabilities()
        };
      } catch (packagesError) {
        return {
          success: true,
          message: `Connected to GHCR as ${userData.login} (limited package access)`,
          repositoryCount: 0,
          capabilities: this.getSupportedCapabilities()
        };
      }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        error: error instanceof Error ? error : new Error('Unknown error')
      };
    }
  }
  
  // Override to add GHCR specific error handling
  protected async makeAuthenticatedRequest(url: string, options?: RequestInit): Promise<Response> {
    try {
      return await super.makeAuthenticatedRequest(url, options);
    } catch (error) {
      if (error instanceof Error) {
        // Handle GitHub API specific errors
        if (error.message.includes('401')) {
          throw new Error('GitHub token is invalid or expired. Please check your Personal Access Token.');
        }
        
        if (error.message.includes('403')) {
          if (error.message.includes('rate limit')) {
            throw new Error('GitHub API rate limit exceeded. Please try again later.');
          }
          throw new Error('Access forbidden. Your token may not have the required "packages:read" scope.');
        }
        
        if (error.message.includes('404')) {
          throw new Error('Package or organization not found. Please check the package name and your access permissions.');
        }
      }
      
      throw error;
    }
  }
  
  // Override refreshAuth for GHCR (tokens don't expire, but we can validate them)
  async refreshAuth(): Promise<void> {
    const userUrl = `${this.config.apiBaseUrl}/user`;
    try {
      await this.makeAuthenticatedRequest(userUrl);
      logger.debug('GHCR token is valid');
    } catch (error) {
      logger.error('GHCR token validation failed', error);
      throw error;
    }
  }
  
  // Get detailed package information including vulnerability data if available
  async getPackageDetails(namespace: string | null, imageName: string): Promise<any> {
    await this.handleRateLimit();
    
    const owner = namespace || this.config.username;
    const url = `${this.config.apiBaseUrl}/${this.config.organization ? 'orgs' : 'users'}/${owner}/packages/container/${imageName}`;
    
    this.logRequest('GET', url);
    const response = await this.makeAuthenticatedRequest(url);
    return await response.json();
  }
}