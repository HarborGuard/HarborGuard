import { promisify } from 'util';
import { exec } from 'child_process';
import type { Repository } from '@/generated/prisma';
import { logger } from '@/lib/logger';
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

const execAsync = promisify(exec);

export interface ImageReference {
  registry?: string;
  namespace?: string;
  image: string;
  tag: string;
}

export interface ImageInspection {
  digest: string;
  mediaType: string;
  size: number;
  config: any;
  layers: any[];
  created?: Date;
  author?: string;
  architecture?: string;
  os?: string;
}

export interface SkopeoOptions {
  insecure?: boolean;
  authFile?: string;
  platform?: string;
  retryTimes?: number;
  quiet?: boolean;
}

/**
 * Enhanced base class for registry providers with built-in skopeo operations
 */
export abstract class EnhancedRegistryProvider {
  protected repository: Repository;
  protected config: RegistryConfig;
  
  constructor(repository: Repository) {
    this.repository = repository;
    this.config = this.parseConfig(repository);
  }
  
  // ===== Abstract Methods - Must be implemented by each provider =====
  
  /**
   * Get authentication arguments for skopeo commands
   * Each registry has different auth mechanisms
   */
  abstract getSkopeoAuthArgs(): Promise<string>;
  
  /**
   * Parse repository config into provider-specific format
   */
  protected abstract parseConfig(repository: Repository): RegistryConfig;
  
  /**
   * Provider metadata
   */
  abstract getProviderName(): string;
  abstract getSupportedCapabilities(): RegistryCapability[];
  abstract getRateLimits(): RateLimit;
  
  /**
   * Test connection to the registry
   */
  abstract testConnection(): Promise<ConnectionTestResult>;
  
  /**
   * Get auth headers for HTTP API calls
   */
  abstract getAuthHeaders(): Promise<Record<string, string>>;
  
  // ===== Registry API Operations (Provider-specific implementation) =====
  
  abstract listImages(options?: ListImagesOptions): Promise<RegistryImage[]>;
  abstract getImageMetadata(namespace: string | null, imageName: string): Promise<ImageMetadata>;
  abstract getTags(namespace: string | null, imageName: string): Promise<ImageTag[]>;
  
  // ===== Common Skopeo Operations (Shared implementation) =====
  
  /**
   * Pull an image from the registry to local tar archive
   */
  async pullImage(image: string, tag: string, destination: string): Promise<void> {
    const registry = this.formatRegistryForSkopeo();
    const imageRef = `${registry}/${image}:${tag || 'latest'}`;
    const authArgs = await this.getSkopeoAuthArgs();
    // For copy command pulling FROM registry, replace --creds with --src-creds
    const srcAuthArgs = authArgs.replace('--creds', '--src-creds');
    const tlsVerify = this.shouldVerifyTLS() ? '' : '--tls-verify=false';
    
    const command = `skopeo copy ${srcAuthArgs} ${tlsVerify} docker://${imageRef} docker-archive:${destination}`;
    
    logger.info(`Pulling image ${imageRef} to ${destination}`);
    await this.executeSkopeoCommand(command);
  }
  
  /**
   * Push an image from local tar archive to the registry
   */
  async pushImage(source: string, image: string, tag: string): Promise<void> {
    const imageRef = this.formatImageReference({ image, tag });
    const authArgs = await this.getSkopeoAuthArgs();
    // For copy command pushing TO registry, replace --creds with --dest-creds
    const destAuthArgs = authArgs.replace('--creds', '--dest-creds');
    const tlsVerify = this.shouldVerifyTLS() ? '' : '--tls-verify=false';
    
    const command = `skopeo copy ${destAuthArgs} ${tlsVerify} docker-archive:${source} docker://${imageRef}`;
    
    logger.info(`Pushing image from ${source} to ${imageRef}`);
    await this.executeSkopeoCommand(command);
  }
  
  /**
   * Copy an image between registries
   */
  async copyImage(source: ImageReference, destination: ImageReference): Promise<void> {
    const sourceRef = this.formatImageReference(source);
    const destRef = this.formatImageReference(destination);
    const authArgs = await this.getSkopeoAuthArgs();
    const tlsVerify = this.shouldVerifyTLS() ? '' : '--tls-verify=false';
    
    const command = `skopeo copy ${authArgs} ${tlsVerify} docker://${sourceRef} docker://${destRef}`;
    
    logger.info(`Copying image from ${sourceRef} to ${destRef}`);
    await this.executeSkopeoCommand(command);
  }
  
  /**
   * Inspect an image to get detailed metadata
   */
  async inspectImage(image: string, tag: string): Promise<ImageInspection> {
    const registry = this.formatRegistryForSkopeo();
    const imageRef = `${registry}/${image}:${tag || 'latest'}`;
    const authArgs = await this.getSkopeoAuthArgs();
    const tlsVerify = this.shouldVerifyTLS() ? '' : '--tls-verify=false';
    
    const command = `skopeo inspect ${authArgs} ${tlsVerify} docker://${imageRef}`;
    
    console.log('[EnhancedRegistryProvider.inspectImage] Building skopeo command:', {
      repositoryType: this.repository.type,
      registry,
      image,
      tag: tag || 'latest',
      imageRef,
      tlsVerify,
      finalCommand: command.replace(/--creds "[^"]+"/, '--creds "***"')
    });
    
    logger.debug(`Inspecting image ${imageRef}`);
    const { stdout } = await this.executeSkopeoCommand(command);
    
    const result = JSON.parse(stdout);
    
    // Normalize the response to ensure we have a digest field
    if (!result.digest && result.Digest) {
      result.digest = result.Digest;
    }
    
    // Also ensure config exists with normalized fields
    if (!result.config) {
      result.config = {
        os: result.Os || 'unknown',
        architecture: result.Architecture || 'unknown',
        size: result.Size || 0
      };
    }
    
    return result;
  }
  
  /**
   * Get the digest of an image
   */
  async getImageDigest(image: string, tag: string): Promise<string> {
    const registry = this.formatRegistryForSkopeo();
    const imageRef = `${registry}/${image}:${tag || 'latest'}`;
    const authArgs = await this.getSkopeoAuthArgs();
    const tlsVerify = this.shouldVerifyTLS() ? '' : '--tls-verify=false';
    
    const command = `skopeo inspect ${authArgs} ${tlsVerify} --format '{{.Digest}}' docker://${imageRef}`;
    
    logger.debug(`Getting digest for ${imageRef}`);
    const { stdout } = await this.executeSkopeoCommand(command);
    
    return stdout.trim();
  }
  
  /**
   * List tags for an image using skopeo
   */
  async listTagsViaSkopeo(image: string): Promise<string[]> {
    const imageRef = this.formatImageReference({ image, tag: '' }).replace(/:\s*$/, '');
    const authArgs = await this.getSkopeoAuthArgs();
    const tlsVerify = this.shouldVerifyTLS() ? '' : '--tls-verify=false';
    
    const command = `skopeo list-tags ${authArgs} ${tlsVerify} docker://${imageRef}`;
    
    logger.debug(`Listing tags for ${imageRef}`);
    const { stdout } = await this.executeSkopeoCommand(command);
    
    const result = JSON.parse(stdout);
    return result.Tags || [];
  }
  
  // ===== Optional Operations with Default Implementations =====
  
  /**
   * Search for images in the registry
   */
  async searchImages(query: string, options?: any): Promise<RegistryImage[]> {
    throw new Error(`Search not supported by ${this.getProviderName()}`);
  }
  
  /**
   * Delete an image from the registry (not all registries support this)
   */
  async deleteImage(image: string, tag: string): Promise<void> {
    throw new Error(`Delete not supported by ${this.getProviderName()}`);
  }
  
  /**
   * Get vulnerability scan results (registry-specific)
   */
  async getVulnerabilities(image: string, tag: string): Promise<Vulnerability[]> {
    return [];
  }
  
  /**
   * Refresh authentication token (for registries with expiring tokens)
   */
  async refreshAuth(): Promise<void> {
    // Override in providers that need token refresh (ECR, GCR, etc.)
  }
  
  // ===== Utility Methods =====
  
  /**
   * Format registry URL for skopeo commands (removes protocol, adds port for GitLab)
   */
  protected formatRegistryForSkopeo(): string {
    let registry = this.repository.registryUrl;
    
    console.log('[EnhancedRegistryProvider.formatRegistryForSkopeo] Input:', {
      repositoryType: this.repository.type,
      registryUrl: this.repository.registryUrl,
      registryPort: this.repository.registryPort
    });
    
    // Remove protocol if present for docker:// format
    registry = registry.replace(/^https?:\/\//, '');
    
    // For GitLab repositories, the port is already included in the registryUrl
    // (e.g., "http://24.199.119.91:5050" becomes "24.199.119.91:5050")
    // For other registries, add port if specified separately
    if (this.repository.type !== 'GITLAB' && this.repository.registryPort && !registry.includes(':')) {
      registry = `${registry}:${this.repository.registryPort}`;
    }
    
    console.log('[EnhancedRegistryProvider.formatRegistryForSkopeo] Output:', {
      cleanedRegistry: registry
    });
    
    return registry;
  }
  
  /**
   * Handle rate limiting
   */
  protected async handleRateLimit(): Promise<void> {
    const rateLimits = this.getRateLimits();
    // Simple rate limiting implementation
    if (rateLimits.requestsPerMinute && rateLimits.requestsPerMinute > 0) {
      const delay = 60000 / rateLimits.requestsPerMinute;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  /**
   * Log a request
   */
  protected logRequest(method: string, url: string): void {
    logger.debug(`[${this.getProviderName()}] ${method} ${url.replace(/\/\/[^@]+@/, '//***@')}`);
  }
  
  /**
   * Format a date string
   */
  protected formatDate(dateString: string | null | undefined): Date | undefined {
    if (!dateString) return undefined;
    try {
      return new Date(dateString);
    } catch {
      return undefined;
    }
  }
  
  /**
   * Parse an image name into namespace and name
   */
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
  
  /**
   * Build a full image name
   */
  protected buildFullName(namespace: string | null, imageName: string): string {
    return namespace ? `${namespace}/${imageName}` : imageName;
  }
  
  /**
   * Format an image reference for the registry
   */
  protected formatImageReference(ref: ImageReference): string {
    // Use the helper method to format registry URL
    let registry = ref.registry ? ref.registry.replace(/^https?:\/\//, '') : this.formatRegistryForSkopeo();
    let imageName = ref.image;
    
    console.log('[EnhancedRegistryProvider.formatImageReference] Input:', {
      repositoryType: this.repository.type,
      refRegistry: ref.registry,
      refImage: ref.image,
      refNamespace: ref.namespace,
      refTag: ref.tag,
      computedRegistry: registry
    });
    
    // If the image already starts with the registry URL, don't add it again
    if (imageName.startsWith(registry + '/')) {
      imageName = imageName.substring(registry.length + 1);
    } else if (imageName.startsWith(registry)) {
      // Handle case where image is exactly the registry
      imageName = imageName.substring(registry.length);
      if (imageName.startsWith('/')) {
        imageName = imageName.substring(1);
      }
    }
    
    const parts = [registry];
    
    if (ref.namespace) {
      parts.push(ref.namespace);
    }
    
    parts.push(`${imageName}:${ref.tag || 'latest'}`);
    
    const result = parts.join('/');
    
    console.log('[EnhancedRegistryProvider.formatImageReference] Output:', {
      parts,
      result
    });
    
    return result;
  }
  
  /**
   * Check if TLS verification should be enabled
   */
  protected shouldVerifyTLS(): boolean {
    const url = this.repository.registryUrl;
    return !(
      url.includes('localhost') ||
      url.includes('127.0.0.1') ||
      url.startsWith('http://') ||
      this.repository.protocol === 'http'
    );
  }
  
  /**
   * Execute a skopeo command with retry logic
   */
  protected async executeSkopeoCommand(
    command: string,
    options: SkopeoOptions = {}
  ): Promise<{ stdout: string; stderr: string }> {
    const maxRetries = options.retryTimes || 3;
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.debug(`Executing skopeo command (attempt ${attempt}/${maxRetries}): ${command}`);
        
        const { stdout, stderr } = await execAsync(command, {
          maxBuffer: 50 * 1024 * 1024, // 50MB buffer
          timeout: 5 * 60 * 1000, // 5 minute timeout
        });
        
        return { stdout, stderr };
      } catch (error: any) {
        lastError = error;
        logger.warn(`Skopeo command failed (attempt ${attempt}/${maxRetries}):`, error.message);
        
        if (attempt < maxRetries) {
          // Exponential backoff
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          await new Promise(resolve => setTimeout(resolve, delay));
          
          // Try to refresh auth if it might have expired
          if (this.isAuthError(error)) {
            await this.refreshAuth().catch(() => {
              // Ignore refresh errors, will retry with existing auth
            });
          }
        }
      }
    }
    
    throw lastError || new Error('Skopeo command failed after all retries');
  }
  
  /**
   * Check if an error is related to authentication
   */
  protected isAuthError(error: any): boolean {
    const message = error.message || error.toString();
    return /unauthorized|401|403|forbidden|authentication|credential/i.test(message);
  }
  
  /**
   * Make an authenticated HTTP request to the registry API
   */
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
  
  /**
   * Get health status of the registry
   */
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
  
  /**
   * Check if registry is healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      const result = await this.testConnection();
      return result.success;
    } catch {
      return false;
    }
  }
}