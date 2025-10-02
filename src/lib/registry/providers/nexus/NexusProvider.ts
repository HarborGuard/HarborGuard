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
 * - Automatic configuration of Nexus for Docker operations
 * - Support for Docker push/pull operations
 * - Image scanning and metadata retrieval
 *
 * Auto-configuration (performed on connection test):
 * 1. Enables Docker Bearer Token Realm
 * 2. Enables anonymous access (required for Docker Token)
 * 3. Configures Docker repository with basic auth
 *
 * Port configuration:
 * - Port 8081: Main Nexus API
 * - Port 8082: Docker HTTP registry
 * - Port 8083: Docker HTTPS registry
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
      repositoryName
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
    // For Docker operations, Nexus uses a different port (8082 for HTTP, 8083 for HTTPS)
    let url = this.config.registryUrl;

    // Remove protocol if present
    url = url.replace(/^https?:\/\//, '');

    // Replace port 8081 with 8082 (Docker HTTP port) if present
    if (url.includes(':8081')) {
      url = url.replace(':8081', ':8082');
    } else if (!url.includes(':')) {
      // If no port specified, add Docker HTTP port
      url = `${url}:8082`;
    }

    // Nexus Docker repositories don't use /repository/ path prefix for Docker operations
    return url;
  }

  protected formatRegistryForSkopeo(): string {
    // For Nexus, we need to include the repository path
    return this.getDockerRegistryUrl();
  }

  /**
   * Automatically configure Nexus for Docker operations
   * This sets up the necessary realms and repository settings
   */
  async configureNexusForDocker(): Promise<void> {
    const apiUrl = this.getApiUrl();
    const headers = await this.getAuthHeaders();

    try {
      // 1. Enable Docker Bearer Token Realm
      const realmsResponse = await fetch(`${apiUrl}/service/rest/v1/security/realms/active`, {
        headers
      });

      if (realmsResponse.ok) {
        const currentRealms = await realmsResponse.json();
        if (!currentRealms.includes('DockerToken')) {
          const updatedRealms = [...currentRealms, 'DockerToken'];
          await fetch(`${apiUrl}/service/rest/v1/security/realms/active`, {
            method: 'PUT',
            headers: {
              ...headers,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(updatedRealms)
          });
          logger.info('Enabled Docker Bearer Token Realm');
        }
      }

      // 2. Enable anonymous access (required for Docker Token Realm)
      await fetch(`${apiUrl}/service/rest/v1/security/anonymous`, {
        method: 'PUT',
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          enabled: true,
          userId: 'anonymous',
          realmName: 'NexusAuthorizingRealm'
        })
      });
      logger.info('Enabled anonymous access for Docker');

      // 3. Configure Docker repository with basic auth
      const repoName = this.config.repositoryName || 'docker-hosted';
      await fetch(`${apiUrl}/service/rest/v1/repositories/docker/hosted/${repoName}`, {
        method: 'PUT',
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: repoName,
          online: true,
          storage: {
            blobStoreName: 'default',
            strictContentTypeValidation: true,
            writePolicy: 'allow'
          },
          docker: {
            v1Enabled: false,
            forceBasicAuth: true,
            httpPort: 8082,
            httpsPort: null
          }
        })
      });
      logger.info('Configured Docker repository with basic auth');
    } catch (error) {
      logger.warn('Failed to auto-configure Nexus for Docker:', error);
      // Non-fatal - continue with existing configuration
    }
  }

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      const apiUrl = this.getApiUrl();
      const catalogUrl = `${apiUrl}/service/rest/v1/repositories`;

      logger.info('Testing Nexus connection:', { apiUrl, catalogUrl, username: this.config.username });

      // Attempt to auto-configure Nexus for Docker operations
      await this.configureNexusForDocker();

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

    // Add continuation token for pagination if offset is provided
    if (options.offset) {
      // Nexus uses continuation tokens, we'll need to handle this differently
      // For now, we'll fetch all and slice
    }

    this.logRequest('GET', url);
    const images: RegistryImage[] = [];
    let continuationToken: string | null = null;

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
          }
        }
      }

      continuationToken = data.continuationToken || null;

      // Respect limit if provided
      if (options.limit && images.length >= options.limit) {
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
}