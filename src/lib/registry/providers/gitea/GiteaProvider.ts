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
  GiteaConfig
} from '../../types';
import { logger } from '@/lib/logger';

/**
 * Gitea/Forgejo container registry provider.
 *
 * Forgejo is API-compatible with Gitea, so this single provider serves
 * both platforms.
 *
 * Key characteristics:
 * - Does NOT support the Docker v2 `/v2/_catalog` endpoint
 * - Image listing uses the Gitea REST API: GET /api/v1/packages/{owner}?type=container
 * - Auth: Personal Access Token (PAT) passed as `token <PAT>` header for REST API
 * - Docker v2 operations (tags, pull/push) use standard Docker token challenge
 *   which skopeo handles natively via --creds
 * - The `organization` field stores the package owner (user or org)
 */
export class GiteaProvider extends EnhancedRegistryProvider {
  protected config: GiteaConfig;

  constructor(repository: Repository) {
    super(repository);
    this.config = this.parseConfig(repository) as GiteaConfig;
  }

  getProviderName(): string {
    return 'Gitea / Forgejo';
  }

  getSupportedCapabilities(): RegistryCapability[] {
    return ['LIST_IMAGES', 'GET_TAGS', 'GET_METADATA'];
  }

  getRateLimits(): RateLimit {
    // Self-hosted instances typically have generous limits
    return {
      requestsPerHour: 5000,
      requestsPerMinute: 100,
      burstLimit: 200
    };
  }

  protected parseConfig(repository: Repository): GiteaConfig {
    return {
      username: repository.username || '',
      pat: repository.encryptedPassword || '',
      registryUrl: repository.registryUrl || '',
      organization: repository.organization || repository.username || ''
    };
  }

  // ---- Auth ----

  async getAuthHeaders(): Promise<Record<string, string>> {
    if (!this.config.pat) {
      return {};
    }
    return {
      'Authorization': `token ${this.config.pat}`
    };
  }

  async getSkopeoAuthArgs(): Promise<string> {
    if (!this.config.username?.trim() || !this.config.pat?.trim()) {
      return '--no-creds';
    }
    const escapedUsername = this.config.username.replace(/"/g, '\\"');
    const escapedPat = this.config.pat.replace(/"/g, '\\"');
    return `--creds "${escapedUsername}:${escapedPat}"`;
  }

  // ---- Helpers ----

  /**
   * Get the base URL for the Gitea REST API (with protocol).
   * Ensures the URL always starts with a protocol.
   */
  private getApiBaseUrl(): string {
    let url = this.config.registryUrl;
    if (!/^https?:\/\//.test(url)) {
      const protocol = this.repository.protocol || 'https';
      url = `${protocol}://${url}`;
    }
    // Strip trailing slash
    return url.replace(/\/+$/, '');
  }

  /**
   * Get the registry host (without protocol) for Docker image references.
   */
  private getRegistryHost(): string {
    return this.config.registryUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  }

  /**
   * Get the package owner (user or org) whose packages we are listing.
   */
  private getOwner(): string {
    return this.config.organization || this.config.username;
  }

  // ---- Image listing (Gitea REST API) ----

  async listImages(options: ListImagesOptions = {}): Promise<RegistryImage[]> {
    await this.handleRateLimit();

    const baseUrl = this.getApiBaseUrl();
    const owner = this.getOwner();
    const limit = Math.min(options.limit || 50, 50);
    const page = options.offset ? Math.floor(options.offset / limit) + 1 : 1;

    const url = `${baseUrl}/api/v1/packages/${encodeURIComponent(owner)}?type=container&limit=${limit}&page=${page}`;
    this.logRequest('GET', url);

    const headers = await this.getAuthHeaders();
    const response = await fetch(url, { headers });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Failed to list packages: HTTP ${response.status}: ${errorText}`);
    }

    const packages: any[] = await response.json();

    const images: RegistryImage[] = packages.map((pkg: any) => ({
      namespace: owner,
      name: pkg.name,
      fullName: `${owner}/${pkg.name}`,
      description: pkg.description || undefined,
      isPrivate: pkg.internal || false,
      lastUpdated: this.formatDate(pkg.created_at)
    }));

    // Apply query filter if provided
    if (options.query) {
      const q = options.query.toLowerCase();
      return images.filter(
        (img) =>
          img.name.toLowerCase().includes(q) ||
          img.description?.toLowerCase().includes(q)
      );
    }

    return images;
  }

  // ---- Tags (Docker v2 API via token challenge) ----

  async getTags(namespace: string | null, imageName: string): Promise<ImageTag[]> {
    await this.handleRateLimit();

    const registryHost = this.getRegistryHost();
    const owner = namespace || this.getOwner();
    const protocol = this.repository.protocol === 'http' ? 'http' : 'https';

    const v2Url = `${protocol}://${registryHost}/v2/${owner}/${imageName}/tags/list`;
    this.logRequest('GET', v2Url);

    try {
      const response = await this.makeAuthenticatedRequestWithChallenge(v2Url);
      const data = await response.json();

      return (data.tags || []).map((tag: string) => ({
        name: tag,
        size: undefined,
        created: undefined,
        lastModified: undefined,
        digest: null,
        platform: undefined
      }));
    } catch (error) {
      logger.warn(`[Gitea] Failed to fetch tags for ${owner}/${imageName}:`, error);
      return [];
    }
  }

  // ---- Image metadata ----

  async getImageMetadata(namespace: string | null, imageName: string): Promise<ImageMetadata> {
    await this.handleRateLimit();

    const owner = namespace || this.getOwner();
    const tags = await this.getTags(namespace, imageName);

    return {
      namespace: owner,
      name: imageName,
      description: undefined,
      isPrivate: true,
      lastUpdated: undefined,
      tags
    };
  }

  // ---- Connection test ----

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      const baseUrl = this.getApiBaseUrl();

      // Step 1: Validate credentials by calling GET /api/v1/user
      const userUrl = `${baseUrl}/api/v1/user`;
      this.logRequest('GET', userUrl);

      const headers = await this.getAuthHeaders();
      const userResponse = await fetch(userUrl, { headers });

      if (!userResponse.ok) {
        const errorText = await userResponse.text().catch(() => 'Unknown error');
        if (userResponse.status === 401) {
          throw new Error('Personal Access Token is invalid or expired. Please check your PAT.');
        }
        throw new Error(`Failed to authenticate: HTTP ${userResponse.status}: ${errorText}`);
      }

      const userData = await userResponse.json();
      const loginName = userData.login || userData.username || 'unknown';

      // Step 2: Try listing packages to verify container registry access
      try {
        const images = await this.listImages({ limit: 1 });
        return {
          success: true,
          message: `Successfully connected to Gitea/Forgejo as ${loginName}`,
          repositoryCount: images.length,
          capabilities: this.getSupportedCapabilities()
        };
      } catch (packagesError) {
        return {
          success: true,
          message: `Connected to Gitea/Forgejo as ${loginName} (limited package access)`,
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

  // ---- Image reference formatting ----

  formatFullImageReference(image: string, tag: string): string {
    const registryHost = this.getRegistryHost();
    const owner = this.getOwner();
    const cleanTag = tag || 'latest';

    // Remove registry host prefix if already present
    let cleanImage = image;
    if (cleanImage.startsWith(`${registryHost}/`)) {
      cleanImage = cleanImage.substring(registryHost.length + 1);
    }

    // Remove owner prefix if already present
    if (cleanImage.startsWith(`${owner}/`)) {
      cleanImage = cleanImage.substring(owner.length + 1);
    }

    return `${registryHost}/${owner}/${cleanImage}:${cleanTag}`;
  }

  // ---- Validation ----

  validateConfiguration(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.config.registryUrl?.trim()) {
      errors.push('Instance URL is required');
    }

    if (!this.config.username?.trim()) {
      errors.push('Username is required');
    }

    if (!this.config.pat?.trim()) {
      errors.push('Personal Access Token is required');
    }

    if (!this.getOwner()?.trim()) {
      errors.push('Package Owner is required');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  // ---- Provider detection ----

  static canHandle(repository: Repository): boolean {
    return (
      repository.type === 'GITEA' ||
      (repository.registryUrl?.includes('gitea') ?? false) ||
      (repository.registryUrl?.includes('forgejo') ?? false) ||
      (repository.registryUrl?.includes('codeberg.org') ?? false)
    );
  }
}
