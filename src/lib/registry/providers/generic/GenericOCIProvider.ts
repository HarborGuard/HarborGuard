import type { Repository } from '@/generated/prisma';
import { EnhancedRegistryProvider } from '../base/EnhancedRegistryProvider';
import type {
  GenericOCIConfig,
  RegistryImage,
  ImageTag,
  ImageMetadata,
  ConnectionTestResult,
  ListImagesOptions,
  RegistryCapability,
  RateLimit
} from '../../types';
import { logger } from '@/lib/logger';

export class GenericOCIProvider extends EnhancedRegistryProvider {
  protected config: GenericOCIConfig;
  
  constructor(repository: Repository) {
    super(repository);
    this.config = this.parseConfig(repository) as GenericOCIConfig;
  }
  
  getProviderName(): string {
    return 'Generic OCI Registry';
  }
  
  getSupportedCapabilities(): RegistryCapability[] {
    return ['LIST_IMAGES', 'GET_TAGS', 'GET_METADATA'];
  }
  
  getRateLimits(): RateLimit {
    // Generic registries usually have more lenient rate limits
    return {
      requestsPerHour: 1000,
      requestsPerMinute: 60,
      burstLimit: 100
    };
  }
  
  protected parseConfig(repository: Repository): GenericOCIConfig {
    return {
      username: repository.username,
      password: repository.encryptedPassword, // TODO: decrypt in production
      registryUrl: repository.registryUrl,
      protocol: repository.protocol
    };
  }
  
  async getAuthHeaders(): Promise<Record<string, string>> {
    const auth = Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64');
    return { 'Authorization': `Basic ${auth}` };
  }
  
  async getSkopeoAuthArgs(): Promise<string> {
    return `--creds ${this.config.username}:${this.config.password}`;
  }
  
  private getRegistryUrl(): string {
    let url = `${this.config.protocol}://${this.config.registryUrl}`;
    if (!url.endsWith('/')) {
      url += '/';
    }
    return url;
  }
  
  async listImages(options: ListImagesOptions = {}): Promise<RegistryImage[]> {
    await this.handleRateLimit();
    
    const url = `${this.getRegistryUrl()}v2/_catalog`;
    
    this.logRequest('GET', url);
    const response = await this.makeAuthenticatedRequest(url);
    const data = await response.json();
    
    let repositories = data.repositories || [];
    
    // Apply pagination if needed
    if (options.offset) {
      repositories = repositories.slice(options.offset);
    }
    if (options.limit) {
      repositories = repositories.slice(0, options.limit);
    }
    
    // Filter by namespace if provided
    if (options.namespace) {
      repositories = repositories.filter((name: string) => 
        name.startsWith(`${options.namespace}/`)
      );
    }
    
    // Filter by query if provided
    if (options.query) {
      repositories = repositories.filter((name: string) => 
        name.toLowerCase().includes(options.query!.toLowerCase())
      );
    }
    
    return repositories.map((name: string) => {
      const { namespace, imageName } = this.parseImageName(name);
      return {
        namespace,
        name: imageName,
        fullName: name,
        description: `Registry image: ${name}`,
        isPrivate: true, // Assume private for generic registries
        starCount: undefined,
        pullCount: undefined,
        lastUpdated: undefined
      };
    });
  }
  
  async getImageMetadata(namespace: string | null, imageName: string): Promise<ImageMetadata> {
    await this.handleRateLimit();
    
    const fullName = this.buildFullName(namespace, imageName);
    
    // Get tags for this image
    const tags = await this.getTags(namespace, imageName);
    
    // For generic registries, we have limited metadata
    return {
      namespace,
      name: imageName,
      description: `Registry image: ${fullName}`,
      isPrivate: true,
      starCount: undefined,
      pullCount: undefined,
      lastUpdated: undefined,
      availableTags: tags
    };
  }
  
  async getTags(namespace: string | null, imageName: string): Promise<ImageTag[]> {
    await this.handleRateLimit();
    
    const fullName = this.buildFullName(namespace, imageName);
    const url = `${this.getRegistryUrl()}v2/${fullName}/tags/list`;
    
    this.logRequest('GET', url);
    const response = await this.makeAuthenticatedRequest(url);
    const data = await response.json();
    
    return (data.tags || []).map((tag: string) => ({
      name: tag,
      size: null,
      lastUpdated: null,
      digest: null,
      platform: undefined
    }));
  }
  
  async testConnection(): Promise<ConnectionTestResult> {
    try {
      // Test connection by accessing the API version endpoint
      const versionUrl = `${this.getRegistryUrl()}v2/`;
      this.logRequest('GET', versionUrl);
      
      const response = await this.makeAuthenticatedRequest(versionUrl);
      
      if (response.ok) {
        // Try to get catalog to count repositories
        try {
          const images = await this.listImages({ limit: 100 });
          return {
            success: true,
            message: 'Successfully connected to registry',
            repositoryCount: images.length,
            capabilities: this.getSupportedCapabilities()
          };
        } catch (catalogError) {
          // Connection works but catalog might not be available
          return {
            success: true,
            message: 'Connected to registry (catalog not accessible)',
            repositoryCount: 0,
            capabilities: this.getSupportedCapabilities()
          };
        }
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        error: error instanceof Error ? error : new Error('Unknown error')
      };
    }
  }
  
  // Enhanced error handling for OCI registry responses
  protected async makeAuthenticatedRequest(url: string, options?: RequestInit): Promise<Response> {
    try {
      return await super.makeAuthenticatedRequest(url, options);
    } catch (error) {
      if (error instanceof Error) {
        // Handle common OCI registry errors
        if (error.message.includes('401')) {
          throw new Error('Authentication failed. Please check your credentials.');
        }
        
        if (error.message.includes('403')) {
          throw new Error('Access forbidden. You may not have permission to access this registry.');
        }
        
        if (error.message.includes('404')) {
          throw new Error('Registry endpoint not found. Please check the registry URL.');
        }
        
        if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
          throw new Error('Cannot connect to registry. Please check the registry URL and network connectivity.');
        }
        
        if (error.message.includes('certificate')) {
          throw new Error('SSL certificate error. The registry may be using a self-signed certificate.');
        }
      }
      
      throw error;
    }
  }
  
  // Specific method to get manifest information (useful for detailed metadata)
  async getManifest(namespace: string | null, imageName: string, tag: string): Promise<any> {
    await this.handleRateLimit();
    
    const fullName = this.buildFullName(namespace, imageName);
    const url = `${this.getRegistryUrl()}v2/${fullName}/manifests/${tag}`;
    
    this.logRequest('GET', url);
    const response = await this.makeAuthenticatedRequest(url, {
      headers: {
        'Accept': 'application/vnd.docker.distribution.manifest.v2+json, application/vnd.docker.distribution.manifest.list.v2+json'
      }
    });
    
    return await response.json();
  }
  
  // Check if registry supports specific OCI features
  async checkRegistryFeatures(): Promise<{
    supportsDelete: boolean;
    supportsSearch: boolean;
    ociVersion: string | null;
  }> {
    try {
      // Try DELETE operation on a non-existent manifest to see if it's supported
      const deleteSupported = true; // Most OCI registries support delete
      
      // Try to access search endpoint
      let searchSupported = false;
      try {
        const searchUrl = `${this.getRegistryUrl()}v2/_catalog`;
        await this.makeAuthenticatedRequest(searchUrl, { method: 'HEAD' });
        searchSupported = true;
      } catch {
        searchSupported = false;
      }
      
      return {
        supportsDelete: deleteSupported,
        supportsSearch: searchSupported,
        ociVersion: null // Would need to parse from response headers
      };
    } catch {
      return {
        supportsDelete: false,
        supportsSearch: false,
        ociVersion: null
      };
    }
  }
  
  // Override deleteImage to provide basic OCI registry delete support
  async deleteImage(image: string, tag: string): Promise<void> {
    const { namespace, imageName } = this.parseImageName(image);
    const fullName = this.buildFullName(namespace, imageName);
    
    // First get the digest for this tag
    const manifestUrl = `${this.getRegistryUrl()}v2/${fullName}/manifests/${tag}`;
    const response = await this.makeAuthenticatedRequest(manifestUrl, {
      headers: {
        'Accept': 'application/vnd.docker.distribution.manifest.v2+json'
      }
    });
    
    const digest = response.headers.get('Docker-Content-Digest');
    if (!digest) {
      throw new Error('Unable to get digest for image');
    }
    
    // Delete using the digest
    const deleteUrl = `${this.getRegistryUrl()}v2/${fullName}/manifests/${digest}`;
    await this.makeAuthenticatedRequest(deleteUrl, { method: 'DELETE' });
    
    logger.info(`Deleted image ${fullName}:${tag} from registry`);
  }
}