import type { Repository } from '@/generated/prisma';
import { EnhancedRegistryProvider } from '../base/EnhancedRegistryProvider';
import type {
  RegistryImage,
  ImageTag,
  ImageMetadata,
  ConnectionTestResult,
  ListImagesOptions,
  RegistryCapability,
  RateLimit,
  RegistryConfig
} from '../../types';
import { logger } from '@/lib/logger';

export interface ACRProviderConfig extends RegistryConfig {
  registryName: string;
  registryUrl: string;
  username: string;
  password: string;
}

export class ACRProvider extends EnhancedRegistryProvider {
  protected config: ACRProviderConfig;

  constructor(repository: Repository) {
    super(repository);
    this.config = this.parseConfig(repository) as ACRProviderConfig;
  }

  getProviderName(): string {
    return 'Azure Container Registry';
  }

  getSupportedCapabilities(): RegistryCapability[] {
    return ['LIST_IMAGES', 'GET_TAGS', 'GET_METADATA', 'DELETE_IMAGES'];
  }

  getRateLimits(): RateLimit {
    // ACR rate limits depend on tier (Basic/Standard/Premium)
    // Using conservative defaults for Standard tier
    return {
      requestsPerHour: 10000,
      requestsPerMinute: 500,
      burstLimit: 200
    };
  }

  protected parseConfig(repository: Repository): ACRProviderConfig {
    // Extract registry name from the URL (e.g., "myregistry.azurecr.io" -> "myregistry")
    const registryUrl = repository.registryUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const registryName = registryUrl.replace(/\.azurecr\.io$/, '');

    return {
      registryName,
      registryUrl,
      username: repository.username,
      password: repository.encryptedPassword // TODO: decrypt in production
    };
  }

  async getAuthHeaders(): Promise<Record<string, string>> {
    const auth = Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64');
    return { 'Authorization': `Basic ${auth}` };
  }

  async getSkopeoAuthArgs(): Promise<string> {
    if (!this.config.username || !this.config.password) {
      return '';
    }
    return `--creds "${this.config.username}:${this.config.password}"`;
  }

  private getRegistryBaseUrl(): string {
    return `https://${this.config.registryName}.azurecr.io`;
  }

  async listImages(options: ListImagesOptions = {}): Promise<RegistryImage[]> {
    await this.handleRateLimit();

    const url = `${this.getRegistryBaseUrl()}/v2/_catalog`;

    this.logRequest('GET', url);
    const response = await this.makeAuthenticatedRequest(url);
    const data = await response.json();

    let repositories = data.repositories || [];

    // Apply pagination
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
        description: `ACR image: ${this.config.registryName}.azurecr.io/${name}`,
        isPrivate: true,
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

    return {
      namespace,
      name: imageName,
      description: `ACR image: ${this.config.registryName}.azurecr.io/${fullName}`,
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
    const url = `${this.getRegistryBaseUrl()}/v2/${fullName}/tags/list`;

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
      const url = `${this.getRegistryBaseUrl()}/v2/`;
      this.logRequest('GET', url);

      const response = await this.makeAuthenticatedRequest(url);

      if (response.ok) {
        // Try to list images to get a count
        try {
          const images = await this.listImages({ limit: 100 });
          return {
            success: true,
            message: `Successfully connected to ACR registry: ${this.config.registryName}.azurecr.io`,
            repositoryCount: images.length,
            capabilities: this.getSupportedCapabilities()
          };
        } catch (catalogError) {
          return {
            success: true,
            message: `Connected to ACR registry: ${this.config.registryName}.azurecr.io (catalog not accessible)`,
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

  validateConfiguration(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.config.registryName?.trim()) {
      errors.push('Registry name is required for Azure Container Registry');
    }

    if (!this.config.username?.trim()) {
      errors.push('Username is required (admin username or service principal client ID)');
    }

    if (!this.config.password?.trim()) {
      errors.push('Password is required (admin password or service principal client secret)');
    }

    // Validate registry name format (alphanumeric, 5-50 chars)
    if (this.config.registryName && !/^[a-zA-Z0-9]{5,50}$/.test(this.config.registryName)) {
      errors.push('Registry name must be 5-50 alphanumeric characters');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  formatFullImageReference(image: string, tag: string): string {
    const registry = `${this.config.registryName}.azurecr.io`;
    const cleanTag = tag || 'latest';

    // Remove registry prefix from image if already present
    const cleanImage = image.replace(new RegExp(`^${registry}/`), '');

    return `${registry}/${cleanImage}:${cleanTag}`;
  }

  // Enhanced error handling for ACR-specific responses
  protected async makeAuthenticatedRequest(url: string, options?: RequestInit): Promise<Response> {
    try {
      return await super.makeAuthenticatedRequest(url, options);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('401')) {
          throw new Error(
            'Authentication failed. Ensure admin user is enabled on your ACR or check your service principal credentials.'
          );
        }

        if (error.message.includes('403')) {
          throw new Error(
            'Access forbidden. Check that your credentials have sufficient permissions for this ACR registry.'
          );
        }

        if (error.message.includes('404')) {
          throw new Error(
            'Registry endpoint not found. Verify the registry name is correct.'
          );
        }

        if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
          throw new Error(
            `Cannot connect to ${this.config.registryName}.azurecr.io. Please verify the registry name and network connectivity.`
          );
        }
      }

      throw error;
    }
  }

  // Delete an image from ACR
  async deleteImage(image: string, tag: string): Promise<void> {
    const { namespace, imageName } = this.parseImageName(image);
    const fullName = this.buildFullName(namespace, imageName);

    // Get the digest for this tag
    const manifestUrl = `${this.getRegistryBaseUrl()}/v2/${fullName}/manifests/${tag}`;
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
    const deleteUrl = `${this.getRegistryBaseUrl()}/v2/${fullName}/manifests/${digest}`;
    await this.makeAuthenticatedRequest(deleteUrl, { method: 'DELETE' });

    logger.info(`Deleted image ${fullName}:${tag} from ACR registry ${this.config.registryName}`);
  }

  static canHandle(repository: Repository): boolean {
    return (
      repository.type === 'ACR' ||
      (repository.registryUrl?.includes('.azurecr.io') ?? false)
    );
  }
}
