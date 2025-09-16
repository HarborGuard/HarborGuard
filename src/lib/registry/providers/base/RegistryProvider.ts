import type { Repository, RepositoryType } from '@/generated/prisma';
import type {
  RegistryImage,
  ImageTag,
  ImageMetadata,
  ConnectionTestResult,
  ListImagesOptions,
  SearchOptions,
  RegistryCapability,
  RateLimit,
  RegistryConfig,
  Vulnerability
} from '../../types';

export abstract class RegistryProvider {
  protected repository: Repository;
  protected config: RegistryConfig;
  
  constructor(repository: Repository) {
    this.repository = repository;
    this.config = this.parseConfig(repository);
  }
  
  // Core abstract methods all providers must implement
  abstract listImages(options?: ListImagesOptions): Promise<RegistryImage[]>;
  abstract getImageMetadata(namespace: string | null, imageName: string): Promise<ImageMetadata>;
  abstract getTags(namespace: string | null, imageName: string): Promise<ImageTag[]>;
  abstract testConnection(): Promise<ConnectionTestResult>;
  abstract getAuthHeaders(): Promise<Record<string, string>>;
  abstract getSkopeoAuthArgs(): Promise<string>;
  
  // Provider metadata
  abstract getProviderName(): string;
  abstract getSupportedCapabilities(): RegistryCapability[];
  abstract getRateLimits(): RateLimit;
  
  protected abstract parseConfig(repository: Repository): RegistryConfig;
  
  // Optional methods with default implementations
  async searchImages(query: string, options?: SearchOptions): Promise<RegistryImage[]> {
    throw new Error(`Search not supported by ${this.getProviderName()}`);
  }
  
  async getImageVulnerabilities(
    namespace: string | null, 
    imageName: string, 
    tag: string
  ): Promise<Vulnerability[]> {
    // Default: empty array - not all registries provide vulnerability scanning
    return [];
  }
  
  async deleteImage(namespace: string | null, imageName: string, tag: string): Promise<void> {
    throw new Error(`Delete not supported by ${this.getProviderName()}`);
  }
  
  // Utility methods
  protected async makeAuthenticatedRequest(
    url: string, 
    options?: RequestInit
  ): Promise<Response> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(url, {
      ...options,
      headers: { ...headers, ...options?.headers }
    });
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    
    return response;
  }
  
  protected parseImageName(fullName: string): { namespace: string | null; imageName: string } {
    const parts = fullName.split('/');
    if (parts.length === 1) {
      return { namespace: null, imageName: parts[0] };
    }
    return { 
      namespace: parts.slice(0, -1).join('/'), 
      imageName: parts[parts.length - 1] 
    };
  }
  
  protected buildFullName(namespace: string | null, imageName: string): string {
    return namespace ? `${namespace}/${imageName}` : imageName;
  }
  
  protected async handleRateLimit(): Promise<void> {
    const rateLimits = this.getRateLimits();
    // Simple rate limiting implementation
    // In production, you'd want more sophisticated rate limiting
    if (rateLimits.requestsPerMinute > 0) {
      const delay = 60000 / rateLimits.requestsPerMinute; // ms between requests
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  protected logRequest(method: string, url: string): void {
    console.log(`[${this.getProviderName()}] ${method} ${url.replace(/\/\/[^@]+@/, '//***@')}`);
  }
  
  protected formatDate(dateString: string | null | undefined): Date | undefined {
    if (!dateString) return undefined;
    try {
      return new Date(dateString);
    } catch {
      return undefined;
    }
  }
  
  protected sanitizeImageName(name: string): string {
    return name.replace(/[^a-zA-Z0-9_.-]/g, '_');
  }
  
  // Health check methods
  async isHealthy(): Promise<boolean> {
    try {
      const result = await this.testConnection();
      return result.success;
    } catch {
      return false;
    }
  }
  
  async getHealthStatus(): Promise<{ 
    status: 'healthy' | 'unhealthy' | 'degraded'; 
    message: string; 
    lastChecked: Date 
  }> {
    const lastChecked = new Date();
    try {
      const result = await this.testConnection();
      return {
        status: result.success ? 'healthy' : 'unhealthy',
        message: result.message,
        lastChecked
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Unknown error',
        lastChecked
      };
    }
  }
}