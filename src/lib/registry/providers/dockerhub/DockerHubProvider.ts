import type { Repository } from '@/generated/prisma';
import { EnhancedRegistryProvider } from '../base/EnhancedRegistryProvider';
import type {
  DockerHubConfig,
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

export class DockerHubProvider extends EnhancedRegistryProvider {
  private token?: string;
  private tokenExpiry?: Date;
  protected config: DockerHubConfig;
  
  constructor(repository: Repository) {
    super(repository);
    this.config = this.parseConfig(repository) as DockerHubConfig;
  }
  
  getProviderName(): string {
    return 'Docker Hub';
  }
  
  getSupportedCapabilities(): RegistryCapability[] {
    return ['LIST_IMAGES', 'GET_TAGS', 'SEARCH', 'GET_METADATA'];
  }
  
  getRateLimits(): RateLimit {
    return {
      requestsPerHour: 200, // Docker Hub free tier
      requestsPerMinute: 10,
      burstLimit: 50
    };
  }
  
  protected parseConfig(repository: Repository): DockerHubConfig {
    return {
      username: repository.username,
      password: repository.encryptedPassword, // TODO: decrypt in production
      organization: repository.organization || undefined,
      apiBaseUrl: 'https://hub.docker.com/v2'
    };
  }
  
  async getAuthHeaders(): Promise<Record<string, string>> {
    // Only try to get token if we have credentials
    if (this.config.username?.trim() && this.config.password?.trim()) {
      await this.ensureValidToken();
      return this.token ? { 'Authorization': `JWT ${this.token}` } : {};
    }
    // No credentials means anonymous access - no auth headers
    return {};
  }
  
  async getSkopeoAuthArgs(): Promise<string> {
    if (this.config.username?.trim() && this.config.password?.trim()) {
      const escapedUsername = this.config.username.replace(/"/g, '\\"');
      const escapedPassword = this.config.password.replace(/"/g, '\\"');
      return `--creds "${escapedUsername}:${escapedPassword}"`;
    }
    // Use --no-creds to prevent using stored credentials from ~/.docker/config.json
    return '--no-creds';
  }

  async listImages(options: ListImagesOptions = {}): Promise<RegistryImage[]> {
    await this.handleRateLimit();
    
    const namespace = this.config.organization || this.config.username;
    const limit = Math.min(options.limit || 100, 100); // Docker Hub max is 100
    let url = `${this.config.apiBaseUrl}/repositories/${namespace}/?page_size=${limit}`;
    
    if (options.offset) {
      const page = Math.floor(options.offset / limit) + 1;
      url += `&page=${page}`;
    }
    
    this.logRequest('GET', url);
    const response = await this.makeAuthenticatedRequest(url);
    const data = await response.json();
    
    return (data.results || []).map((repo: any) => ({
      namespace,
      name: repo.name,
      fullName: `${namespace}/${repo.name}`,
      description: repo.description || undefined,
      isPrivate: repo.is_private,
      starCount: repo.star_count,
      pullCount: repo.pull_count,
      lastUpdated: this.formatDate(repo.last_updated)
    }));
  }
  
  async getImageMetadata(namespace: string | null, imageName: string): Promise<ImageMetadata> {
    await this.handleRateLimit();
    
    const fullName = this.buildFullName(namespace, imageName);
    const url = `${this.config.apiBaseUrl}/repositories/${fullName}/`;
    
    this.logRequest('GET', url);
    const response = await this.makeAuthenticatedRequest(url);
    const repo = await response.json();
    
    // Get tags as well
    const tags = await this.getTags(namespace, imageName);
    
    return {
      namespace,
      name: imageName,
      description: repo.description || undefined,
      isPrivate: repo.is_private,
      starCount: repo.star_count,
      pullCount: repo.pull_count,
      lastUpdated: this.formatDate(repo.last_updated),
      tags
    };
  }
  
  async getTags(namespace: string | null, imageName: string): Promise<ImageTag[]> {
    await this.handleRateLimit();
    
    const fullName = this.buildFullName(namespace, imageName);
    const url = `${this.config.apiBaseUrl}/repositories/${fullName}/tags/?page_size=100`;
    
    this.logRequest('GET', url);
    const response = await this.makeAuthenticatedRequest(url);
    const data = await response.json();
    
    return (data.results || []).map((tag: any) => ({
      name: tag.name,
      size: tag.full_size,
      created: this.formatDate(tag.last_updated),
      lastModified: this.formatDate(tag.last_updated),
      digest: tag.digest,
      platform: tag.images?.[0]?.architecture && tag.images?.[0]?.os 
        ? `${tag.images[0].os}/${tag.images[0].architecture}`
        : undefined
    }));
  }
  
  async searchImages(query: string, options: SearchOptions = {}): Promise<RegistryImage[]> {
    await this.handleRateLimit();
    
    const limit = Math.min(options.limit || 25, 100);
    let url = `https://hub.docker.com/v2/search/repositories/?query=${encodeURIComponent(query)}&page_size=${limit}`;
    
    if (options.offset) {
      const page = Math.floor(options.offset / limit) + 1;
      url += `&page=${page}`;
    }
    
    this.logRequest('GET', url);
    const response = await fetch(url); // Search endpoint doesn't require auth
    const data = await response.json();
    
    return (data.results || []).map((repo: any) => {
      const { namespace, imageName } = this.parseImageName(repo.repo_name);
      return {
        namespace,
        name: imageName,
        fullName: repo.repo_name,
        description: repo.short_description || undefined,
        isPrivate: false, // Search only returns public repos
        starCount: repo.star_count,
        pullCount: repo.pull_count
      };
    });
  }
  
  async testConnection(): Promise<ConnectionTestResult> {
    try {
      // If we have credentials, test by listing images
      if (this.config.username?.trim() && this.config.password?.trim()) {
        await this.ensureValidToken();

        // Test by listing a small number of images
        const images = await this.listImages({ limit: 1 });

        return {
          success: true,
          message: 'Successfully connected to Docker Hub with authentication',
          repositoryCount: images.length > 0 ? 1 : 0, // We only fetched 1
          capabilities: this.getSupportedCapabilities()
        };
      } else {
        // For anonymous access, test if we can search (doesn't require auth)
        await this.searchImages('alpine', { limit: 1 });

        return {
          success: true,
          message: 'Successfully connected to Docker Hub (anonymous access - may have rate limits)',
          repositoryCount: 0,
          capabilities: ['SEARCH']
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
  
  private async ensureValidToken(): Promise<void> {
    // Don't try to get token if we don't have credentials
    if (!this.config.username?.trim() || !this.config.password?.trim()) {
      logger.debug('No credentials provided, skipping token authentication');
      return;
    }

    if (this.token && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return; // Token is still valid
    }

    const loginUrl = 'https://hub.docker.com/v2/users/login/';
    this.logRequest('POST', loginUrl);

    const response = await fetch(loginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: this.config.username,
        password: this.config.password
      })
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Docker Hub authentication failed: ${errorText}`);
    }

    const data = await response.json();
    this.token = data.token;
    this.tokenExpiry = new Date(Date.now() + 30 * 60000); // 30 minutes
  }
  
  // Override to add Docker Hub specific error handling
  protected async makeAuthenticatedRequest(url: string, options?: RequestInit): Promise<Response> {
    try {
      return await super.makeAuthenticatedRequest(url, options);
    } catch (error) {
      // Handle Docker Hub specific errors
      if (error instanceof Error) {
        if (error.message.includes('401')) {
          // Token might be expired, clear it and retry once
          this.token = undefined;
          this.tokenExpiry = undefined;
          await this.ensureValidToken();
          return await super.makeAuthenticatedRequest(url, options);
        }
        
        if (error.message.includes('404')) {
          throw new Error('Repository or image not found');
        }
        
        if (error.message.includes('429')) {
          throw new Error('Rate limit exceeded. Please try again later.');
        }
      }
      
      throw error;
    }
  }
  
  // Override refreshAuth to refresh Docker Hub JWT token
  async refreshAuth(): Promise<void> {
    this.token = undefined;
    this.tokenExpiry = undefined;
    await this.ensureValidToken();
  }

  validateConfiguration(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // For Docker Hub, credentials are optional (allows anonymous/public access)
    // But if one is provided, both must be provided
    const hasUsername = this.config.username?.trim();
    const hasPassword = this.config.password?.trim();

    if (hasUsername && !hasPassword) {
      errors.push('Password/Token is required when username is provided');
    }

    if (hasPassword && !hasUsername) {
      errors.push('Username is required when password/token is provided');
    }

    // Note: Empty credentials are valid for DockerHub (enables anonymous public access)
    // This may hit rate limits but allows scanning public images without authentication

    return {
      valid: errors.length === 0,
      errors
    };
  }

  formatFullImageReference(image: string, tag: string): string {
    // Docker Hub has a special case - images without a namespace go to "library"
    // But we don't include "docker.io" in the reference for pulling
    const cleanImage = image.replace(/^docker\.io\//, '');
    const cleanTag = tag || 'latest';

    // If image doesn't have a namespace (no /), it's implicitly library/
    if (!cleanImage.includes('/')) {
      return `docker.io/library/${cleanImage}:${cleanTag}`;
    }

    return `docker.io/${cleanImage}:${cleanTag}`;
  }

  static canHandle(repository: Repository): boolean {
    // If type is explicitly set to a non-DockerHub registry, reject
    if (repository.type && repository.type !== 'DOCKERHUB' && repository.type !== 'GENERIC') {
      return false;
    }

    return (
      repository.type === 'DOCKERHUB' ||
      repository.registryUrl === 'docker.io' ||
      repository.registryUrl === 'registry-1.docker.io' ||
      repository.registryUrl === 'index.docker.io'
    );
  }
}