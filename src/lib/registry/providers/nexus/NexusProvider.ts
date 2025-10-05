import type { Repository } from '@/generated/prisma';
import { EnhancedRegistryProvider } from '../base/EnhancedRegistryProvider';
import type {
  NexusConfig,
  RegistryImage,
  ImageTag,
  ImageMetadata,
  ConnectionTestResult,
  ListImagesOptions,
  RegistryCapability,
  RateLimit
} from '../../types';
import { logger } from '@/lib/logger';

/**
 * Nexus Repository Manager provider implementation
 * Supports Docker registries hosted on Sonatype Nexus 3
 *
 * Features:
 * - Support for Docker push/pull operations
 * - Image scanning and metadata retrieval
 * - Repository listing and metadata queries
 *
 * Port configuration:
 * - Port 8081: Main Nexus API
 * - Port 8082: Docker HTTP registry
 * - Port 8083: Docker HTTPS registry
 *
 * Prerequisites:
 * - Nexus must be pre-configured with a Docker repository
 * - Docker Bearer Token Realm should be enabled for Docker operations
 * - Repository credentials must have appropriate permissions
 */
export class NexusProvider extends EnhancedRegistryProvider {
  protected config: NexusConfig;

  constructor(repository: Repository) {
    super(repository);
    this.config = this.parseConfig(repository) as NexusConfig;
  }

  getProviderName(): string {
    return 'Sonatype Nexus3';
  }

  getSupportedCapabilities(): RegistryCapability[] {
    return ['LIST_IMAGES', 'GET_TAGS', 'GET_METADATA', 'SEARCH'];
  }

  getRateLimits(): RateLimit {
    // Nexus usually has generous rate limits for self-hosted instances
    return {
      requestsPerHour: 5000,
      requestsPerMinute: 100,
      burstLimit: 200
    };
  }

  protected parseConfig(repository: Repository): NexusConfig {
    // Extract repository name from organization field or use default
    const repositoryName = repository.organization || 'docker-hosted';

    return {
      username: repository.username,
      // TODO: Implement proper password encryption/decryption
      // Currently using plaintext password stored in encryptedPassword field
      password: repository.encryptedPassword,
      registryUrl: repository.registryUrl,
      protocol: repository.protocol,
      repositoryName,
      skipTlsVerify: repository.skipTlsVerify
    };
  }

  async getAuthHeaders(): Promise<Record<string, string>> {
    const auth = Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64');
    return { 'Authorization': `Basic ${auth}` };
  }

  protected async makeAuthenticatedRequest(
    url: string,
    options?: RequestInit
  ): Promise<Response> {
    const headers = await this.getAuthHeaders();

    const fetchOptions: RequestInit & { dispatcher?: any } = {
      ...options,
      headers: { ...headers, ...options?.headers }
    };

    if (this.config.skipTlsVerify) {
      // For Node.js 18+ undici-based fetch
      const { Agent } = await import('undici');
      fetchOptions.dispatcher = new Agent({
        connect: {
          rejectUnauthorized: false
        }
      });
    }

    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response;
  }

  async getSkopeoAuthArgs(): Promise<string> {
    const args: string[] = [];

    if (this.config.username && this.config.password) {
      // Properly quote credentials to handle special characters
      args.push(`--creds "${this.config.username}:${this.config.password}"`);
    }

    if (this.config.skipTlsVerify) {
      args.push('--tls-verify=false');
    }

    return args.join(' ');
  }

  private getRegistryUrl(): string {
    let url = this.config.registryUrl;

    // Remove protocol if present
    url = url.replace(/^https?:\/\//, '');

    // Add port 8081 if not specified (default Nexus Docker port)
    if (!url.includes(':')) {
      url = `${url}:8081`;
    }

    return url;
  }

  private getApiUrl(): string {
    const protocol = this.config.protocol || 'https';
    let url = this.config.registryUrl;

    // Remove protocol if present in the URL
    url = url.replace(/^https?:\/\//, '');

    // If no port is specified, add default port 8081
    if (!url.includes(':')) {
      url = `${url}:8081`;
    }

    return `${protocol}://${url}`;
  }

  private getDockerRegistryUrl(): string {
    let url = this.config.registryUrl;

    // Remove protocol if present
    url = url.replace(/^https?:\/\//, '');

    // If repository has registryPort configured, use it for Docker operations
    if (this.repository.registryPort) {
      // Replace any existing port with the Docker registry port
      url = url.replace(/:\d+$/, `:${this.repository.registryPort}`);
    } else {
      // No port configured - assume default Nexus setup uses port 5000 for Docker
      url = url.replace(/:\d+$/, ':5000');
    }

    return url;
  }

  protected formatRegistryForSkopeo(): string {
    // For Nexus Docker operations, images are accessed directly as host:port/image:tag
    return this.getDockerRegistryUrl();
  }


  async testConnection(): Promise<ConnectionTestResult> {
    try {
      const apiUrl = this.getApiUrl();
      const catalogUrl = `${apiUrl}/service/rest/v1/repositories`;

      logger.info('Testing Nexus connection:', { apiUrl, catalogUrl, username: this.config.username });

      this.logRequest('GET', catalogUrl);
      const response = await this.makeAuthenticatedRequest(catalogUrl);
      const repositories = await response.json();

      // Find Docker repositories
      const dockerRepos = repositories.filter((repo: any) =>
        repo.format === 'docker' && repo.type === 'hosted'
      );

      if (dockerRepos.length === 0) {
        return {
          success: false,
          message: 'No Docker repositories found in Nexus',
          capabilities: this.getSupportedCapabilities()
        };
      }

      // Try to list components from the Docker repository
      const componentsUrl = `${apiUrl}/service/rest/v1/components?repository=${this.config.repositoryName || dockerRepos[0].name}`;
      this.logRequest('GET', componentsUrl);
      const componentsResponse = await this.makeAuthenticatedRequest(componentsUrl);
      const components = await componentsResponse.json();

      return {
        success: true,
        message: `Connected to Nexus repository: ${this.config.repositoryName || dockerRepos[0].name}`,
        repositoryCount: components.items ? components.items.length : 0,
        capabilities: this.getSupportedCapabilities()
      };
    } catch (error) {
      logger.error('Nexus connection test failed:', error);
      return {
        success: false,
        message: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error: error instanceof Error ? error : new Error('Unknown error')
      };
    }
  }

  async listImages(options: ListImagesOptions = {}): Promise<RegistryImage[]> {
    await this.handleRateLimit();

    const apiUrl = this.getApiUrl();
    const repoName = this.config.repositoryName || 'docker-hosted';

    // Nexus API for listing components in a repository
    let url = `${apiUrl}/service/rest/v1/components?repository=${repoName}`;

    this.logRequest('GET', url);
    const images: RegistryImage[] = [];
    let continuationToken: string | null = null;
    const maxLimit = options.limit || 100; // Default limit to prevent loading all images

    do {
      const requestUrl = continuationToken
        ? `${url}&continuationToken=${continuationToken}`
        : url;

      const response = await this.makeAuthenticatedRequest(requestUrl);
      const data = await response.json();

      if (data.items && Array.isArray(data.items)) {
        for (const item of data.items) {
          // Filter for Docker images
          if (item.format === 'docker') {
            const { namespace, imageName } = this.parseImageName(item.name);
            images.push({
              namespace,
              name: imageName,
              fullName: item.name,
              lastUpdated: item.lastModified ? new Date(item.lastModified) : undefined
            });

            // Stop early if we've reached the limit
            if (images.length >= maxLimit) {
              break;
            }
          }
        }
      }

      continuationToken = data.continuationToken || null;

      // Stop fetching if we've reached the limit
      if (images.length >= maxLimit) {
        break;
      }
    } while (continuationToken);

    // Apply offset and limit
    let result = images;
    if (options.offset) {
      result = result.slice(options.offset);
    }
    if (options.limit) {
      result = result.slice(0, options.limit);
    }

    return result;
  }

  async getImageMetadata(namespace: string | null, imageName: string): Promise<ImageMetadata> {
    await this.handleRateLimit();

    const fullName = this.buildFullName(namespace, imageName);
    const apiUrl = this.getApiUrl();
    const repoName = this.config.repositoryName || 'docker-hosted';

    // Search for the specific component
    const searchUrl = `${apiUrl}/service/rest/v1/search?repository=${repoName}&name=${encodeURIComponent(fullName)}`;

    this.logRequest('GET', searchUrl);
    const response = await this.makeAuthenticatedRequest(searchUrl);
    const data = await response.json();

    if (!data.items || data.items.length === 0) {
      throw new Error(`Image ${fullName} not found`);
    }

    const component = data.items[0];

    // Get tags for this image
    const tags = await this.getTags(namespace, imageName);

    return {
      namespace,
      name: imageName,
      description: component.description,
      isPrivate: true, // Nexus repositories are typically private
      lastUpdated: component.lastModified ? new Date(component.lastModified) : undefined,
      tags
    };
  }

  async getTags(namespace: string | null, imageName: string): Promise<ImageTag[]> {
    await this.handleRateLimit();

    const fullName = this.buildFullName(namespace, imageName);
    const apiUrl = this.getApiUrl();
    const repoName = this.config.repositoryName || 'docker-hosted';

    // Search for all assets of this component
    const searchUrl = `${apiUrl}/service/rest/v1/search/assets?repository=${repoName}&name=${encodeURIComponent(fullName)}`;

    this.logRequest('GET', searchUrl);
    const tags: ImageTag[] = [];
    let continuationToken: string | null = null;

    do {
      const requestUrl = continuationToken
        ? `${searchUrl}&continuationToken=${continuationToken}`
        : searchUrl;

      const response = await this.makeAuthenticatedRequest(requestUrl);
      const data = await response.json();

      if (data.items && Array.isArray(data.items)) {
        for (const asset of data.items) {
          // Extract tag from the asset path
          const pathParts = asset.path.split('/');
          const tag = pathParts[pathParts.length - 1].replace(/\.tar\.gz$/, '');

          if (tag && tag !== 'manifest.json') {
            tags.push({
              name: tag,
              size: asset.fileSize,
              created: asset.lastModified ? new Date(asset.lastModified) : undefined,
              digest: asset.checksum?.sha256 || asset.checksum?.sha1
            });
          }
        }
      }

      continuationToken = data.continuationToken || null;
    } while (continuationToken);

    // If we couldn't get tags from assets, try using v2 registry API
    if (tags.length === 0) {
      try {
        const v2Url = `${this.config.protocol}://${this.getDockerRegistryUrl()}/v2/${fullName}/tags/list`;
        this.logRequest('GET', v2Url);
        const v2Response = await this.makeAuthenticatedRequest(v2Url);
        const v2Data = await v2Response.json();

        if (v2Data.tags && Array.isArray(v2Data.tags)) {
          for (const tagName of v2Data.tags) {
            tags.push({
              name: tagName,
              created: undefined
            });
          }
        }
      } catch (v2Error) {
        logger.debug('Failed to fetch tags via v2 API, using asset API results', v2Error);
      }
    }

    return tags;
  }

  validateConfiguration(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.config.registryUrl?.trim()) {
      errors.push('Registry URL is required for Nexus');
    }

    if (!this.config.username?.trim()) {
      errors.push('Username is required');
    }

    if (!this.config.password?.trim()) {
      errors.push('Password is required');
    }

    // organization field can be used to specify the Nexus repository name

    return {
      valid: errors.length === 0,
      errors
    };
  }

  formatFullImageReference(image: string, tag: string): string {
    const registry = this.getDockerRegistryUrl();
    const cleanTag = tag || 'latest';

    // Remove registry prefix from image if already present
    const cleanImage = image.replace(new RegExp(`^${registry}/`), '');

    // Nexus Docker connector port provides direct access without /repository/ prefix
    return `${registry}/${cleanImage}:${cleanTag}`;
  }

  /**
   * Override inspectImage to implement repository name fallback for Nexus
   */
  async inspectImage(image: string, tag: string): Promise<any> {
    const authArgs = await this.getSkopeoAuthArgs();
    const tlsVerify = this.shouldVerifyTLS() ? '' : '--tls-verify=false';

    // First attempt: try without repository name
    const imageRef = this.formatFullImageReference(image, tag);
    const command = `skopeo inspect ${authArgs} ${tlsVerify} docker://${imageRef}`;

    logger.debug(`[Nexus] Attempting to inspect image: ${imageRef}`);

    try {
      const { stdout } = await this.executeSkopeoCommand(command);
      const result = JSON.parse(stdout);

      // Calculate size from raw manifest
      let totalSize = 0;
      try {
        const rawCommand = `skopeo inspect --raw ${authArgs} ${tlsVerify} docker://${imageRef}`;
        const { stdout: rawStdout } = await this.executeSkopeoCommand(rawCommand);
        const manifest = JSON.parse(rawStdout);

        if (manifest.layers && Array.isArray(manifest.layers)) {
          totalSize = manifest.layers.reduce((sum: number, layer: any) => sum + (layer.size || 0), 0);
          if (manifest.config && manifest.config.size) {
            totalSize += manifest.config.size;
          }
        }
      } catch (error) {
        logger.debug('[Nexus] Failed to get raw manifest for size calculation');
      }

      result.size = totalSize || result.Size || 0;
      if (!result.config) {
        result.config = { size: result.size };
      }

      return result;
    } catch (error) {
      logger.debug(`[Nexus] First attempt failed, trying with repository name: ${this.config.repositoryName}`);

      // Second attempt: try with repository name prefix using the host port
      const hostUrl = this.config.registryUrl.replace(/^https?:\/\//, '');
      const imageRefWithRepo = `${hostUrl}/${this.config.repositoryName}/${image}:${tag || 'latest'}`;
      const fallbackCommand = `skopeo inspect ${authArgs} ${tlsVerify} docker://${imageRefWithRepo}`;

      logger.debug(`[Nexus] Attempting with repository name: ${imageRefWithRepo}`);

      const { stdout } = await this.executeSkopeoCommand(fallbackCommand);
      const result = JSON.parse(stdout);

      // Calculate size from raw manifest
      let totalSize = 0;
      try {
        const rawCommand = `skopeo inspect --raw ${authArgs} ${tlsVerify} docker://${imageRefWithRepo}`;
        const { stdout: rawStdout } = await this.executeSkopeoCommand(rawCommand);
        const manifest = JSON.parse(rawStdout);

        if (manifest.layers && Array.isArray(manifest.layers)) {
          totalSize = manifest.layers.reduce((sum: number, layer: any) => sum + (layer.size || 0), 0);
          if (manifest.config && manifest.config.size) {
            totalSize += manifest.config.size;
          }
        }
      } catch (error) {
        logger.debug('[Nexus] Failed to get raw manifest for size calculation');
      }

      result.size = totalSize || result.Size || 0;
      if (!result.config) {
        result.config = { size: result.size };
      }

      return result;
    }
  }

  /**
   * Override pullImage to implement repository name fallback for Nexus
   */
  async pullImage(image: string, tag: string, destination: string): Promise<void> {
    const authArgs = await this.getSkopeoAuthArgs();
    const srcAuthArgs = authArgs.replace('--creds', '--src-creds').replace('--no-creds', '--src-no-creds');
    const tlsVerify = this.shouldVerifyTLS() ? '' : '--src-tls-verify=false';

    // First attempt: try without repository name
    const imageRef = this.formatFullImageReference(image, tag);
    const command = `skopeo copy ${srcAuthArgs} ${tlsVerify} docker://${imageRef} docker-archive:${destination}`;

    logger.info(`[Nexus] Attempting to pull image: ${imageRef} to ${destination}`);

    try {
      await this.executeSkopeoCommand(command);
    } catch (error) {
      logger.debug(`[Nexus] First attempt failed, trying with repository name: ${this.config.repositoryName}`);

      // Second attempt: try with repository name prefix using the host port
      const hostUrl = this.config.registryUrl.replace(/^https?:\/\//, '');
      const imageRefWithRepo = `${hostUrl}/${this.config.repositoryName}/${image}:${tag || 'latest'}`;
      const fallbackCommand = `skopeo copy ${srcAuthArgs} ${tlsVerify} docker://${imageRefWithRepo} docker-archive:${destination}`;

      logger.info(`[Nexus] Attempting with repository name: ${imageRefWithRepo}`);

      await this.executeSkopeoCommand(fallbackCommand);
    }
  }

  /**
   * Override pushImage to implement repository name fallback for Nexus
   */
  async pushImage(source: string, image: string, tag: string): Promise<void> {
    const authArgs = await this.getSkopeoAuthArgs();
    const destAuthArgs = authArgs.replace('--creds', '--dest-creds').replace('--no-creds', '--dest-no-creds');
    const tlsVerify = this.shouldVerifyTLS() ? '' : '--dest-tls-verify=false';

    // First attempt: try without repository name
    const imageRef = this.formatFullImageReference(image, tag);
    const command = `skopeo copy ${destAuthArgs} ${tlsVerify} docker-archive:${source} docker://${imageRef}`;

    logger.info(`[Nexus] Attempting to push image from ${source} to ${imageRef}`);

    try {
      await this.executeSkopeoCommand(command);
    } catch (error) {
      logger.debug(`[Nexus] First attempt failed, trying with repository name: ${this.config.repositoryName}`);

      // Second attempt: try with repository name prefix using the host port
      const hostUrl = this.config.registryUrl.replace(/^https?:\/\//, '');
      const imageRefWithRepo = `${hostUrl}/${this.config.repositoryName}/${image}:${tag || 'latest'}`;
      const fallbackCommand = `skopeo copy ${destAuthArgs} ${tlsVerify} docker-archive:${source} docker://${imageRefWithRepo}`;

      logger.info(`[Nexus] Attempting with repository name: ${imageRefWithRepo}`);

      await this.executeSkopeoCommand(fallbackCommand);
    }
  }

  static canHandle(repository: Repository): boolean {
    return (
      repository.type === 'NEXUS' ||
      (repository.registryUrl?.includes('nexus') ?? false) ||
      (repository.registryUrl?.includes(':8081') ?? false) ||
      (repository.registryUrl?.includes(':8082') ?? false) ||
      (repository.registryUrl?.includes(':8083') ?? false)
    );
  }
}