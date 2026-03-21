import crypto from 'crypto';
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

interface GARParsedConfig extends RegistryConfig {
  clientEmail: string;
  privateKey: string;
  projectId: string;
  location: string;
  repositoryName: string;
}

/**
 * Google Artifact Registry (GAR) provider.
 *
 * Auth uses an OAuth2 JWT bearer grant signed with a GCP service account key.
 * Image listing goes through the Artifact Registry REST API because GAR does
 * not support the Docker v2 `_catalog` endpoint.  Tag listing and skopeo
 * operations use the standard Docker v2 API with `_dcgcloud_token` credentials.
 */
export class GARProvider extends EnhancedRegistryProvider {
  protected config: GARParsedConfig;

  private accessToken?: string;
  private tokenExpiry?: Date;

  constructor(repository: Repository) {
    super(repository);
    this.config = this.parseConfig(repository) as GARParsedConfig;
  }

  // ---------------------------------------------------------------------------
  // Provider metadata
  // ---------------------------------------------------------------------------

  getProviderName(): string {
    return 'Google Artifact Registry';
  }

  getSupportedCapabilities(): RegistryCapability[] {
    return ['LIST_IMAGES', 'GET_TAGS', 'GET_METADATA'];
  }

  getRateLimits(): RateLimit {
    return {
      requestsPerHour: 1000,
      requestsPerMinute: 60,
      burstLimit: 100
    };
  }

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  protected parseConfig(repository: Repository): GARParsedConfig {
    // The service account JSON key is stored in the password field.
    let serviceAccount: { client_email?: string; private_key?: string; project_id?: string };

    try {
      serviceAccount = JSON.parse(repository.encryptedPassword || '{}');
    } catch {
      serviceAccount = {};
    }

    // Location and repository name can be encoded in `organization` as
    // "location/repository" or provided individually.  Fall back to sensible
    // defaults so the provider can still be instantiated for validation.
    let location = 'us';
    let repositoryName = '';
    if (repository.organization) {
      const parts = repository.organization.split('/');
      if (parts.length >= 2) {
        location = parts[0];
        repositoryName = parts.slice(1).join('/');
      } else {
        repositoryName = parts[0];
      }
    }

    return {
      clientEmail: serviceAccount.client_email || '',
      privateKey: serviceAccount.private_key || '',
      projectId: serviceAccount.project_id || repository.username || '',
      location,
      repositoryName
    };
  }

  validateConfiguration(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.config.clientEmail) {
      errors.push('Service account client_email is missing from the JSON key');
    }
    if (!this.config.privateKey) {
      errors.push('Service account private_key is missing from the JSON key');
    }
    if (!this.config.projectId) {
      errors.push('Project ID is required (extracted from service account key or username field)');
    }
    if (!this.config.location) {
      errors.push('Location is required (e.g. us, us-central1, europe-west1)');
    }
    if (!this.config.repositoryName) {
      errors.push('Repository name is required');
    }

    return { valid: errors.length === 0, errors };
  }

  // ---------------------------------------------------------------------------
  // OAuth2 JWT bearer authentication
  // ---------------------------------------------------------------------------

  async refreshAuth(): Promise<void> {
    const now = Math.floor(Date.now() / 1000);

    // 1. Build JWT
    const header = { alg: 'RS256', typ: 'JWT' };
    const payload = {
      iss: this.config.clientEmail,
      scope: 'https://www.googleapis.com/auth/cloud-platform',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600
    };

    const segments = [
      this.base64url(JSON.stringify(header)),
      this.base64url(JSON.stringify(payload))
    ];
    const signingInput = segments.join('.');

    // 2. Sign with RSA-SHA256
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(signingInput);
    const signature = sign.sign(this.config.privateKey);
    const signedJwt = `${signingInput}.${this.base64url(signature)}`;

    // 3. Exchange for access token
    const body = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: signedJwt
    });

    this.logRequest('POST', 'https://oauth2.googleapis.com/token');
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Google OAuth2 token exchange failed: ${errorText}`);
    }

    const data = await response.json() as { access_token: string; expires_in: number };
    this.accessToken = data.access_token;
    this.tokenExpiry = new Date(Date.now() + (data.expires_in - 60) * 1000); // refresh 60s early

    logger.info('Successfully obtained Google OAuth2 access token');
  }

  private async ensureValidToken(): Promise<void> {
    if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return;
    }
    await this.refreshAuth();
  }

  // ---------------------------------------------------------------------------
  // Auth headers / skopeo args
  // ---------------------------------------------------------------------------

  async getAuthHeaders(): Promise<Record<string, string>> {
    await this.ensureValidToken();
    return { Authorization: `Bearer ${this.accessToken}` };
  }

  async getSkopeoAuthArgs(): Promise<string> {
    await this.ensureValidToken();
    const escapedToken = (this.accessToken || '').replace(/"/g, '\\"');
    return `--creds "_dcgcloud_token:${escapedToken}"`;
  }

  // ---------------------------------------------------------------------------
  // Image reference formatting
  // ---------------------------------------------------------------------------

  formatFullImageReference(image: string, tag: string): string {
    const cleanTag = tag || 'latest';
    const registry = `${this.config.location}-docker.pkg.dev`;
    // image may already be fully qualified
    if (image.includes('.pkg.dev')) {
      return `${image}:${cleanTag}`;
    }
    return `${registry}/${this.config.projectId}/${this.config.repositoryName}/${image}:${cleanTag}`;
  }

  // ---------------------------------------------------------------------------
  // Image listing (Artifact Registry REST API)
  // ---------------------------------------------------------------------------

  async listImages(options: ListImagesOptions = {}): Promise<RegistryImage[]> {
    await this.handleRateLimit();
    await this.ensureValidToken();

    const { location, projectId, repositoryName } = this.config;
    const parent = `projects/${projectId}/locations/${location}/repositories/${repositoryName}`;
    let url = `https://artifactregistry.googleapis.com/v1/${parent}/dockerImages`;

    const params = new URLSearchParams();
    if (options.limit) {
      params.set('pageSize', String(options.limit));
    }
    if (params.toString()) {
      url += `?${params.toString()}`;
    }

    this.logRequest('GET', url);
    const response = await this.makeAuthenticatedRequest(url);
    const data = await response.json() as {
      dockerImages?: Array<{
        name: string;
        uri: string;
        tags?: string[];
        imageSizeBytes?: string;
        uploadTime?: string;
        mediaType?: string;
        buildTime?: string;
        updateTime?: string;
      }>;
    };

    const images: RegistryImage[] = [];
    const seen = new Set<string>();

    for (const img of data.dockerImages || []) {
      // name format: projects/{project}/locations/{loc}/repositories/{repo}/dockerImages/{image}@sha256:...
      const imagePath = img.name.split('/dockerImages/')[1] || '';
      const imageName = imagePath.split('@')[0]; // strip digest

      if (!imageName || seen.has(imageName)) continue;
      seen.add(imageName);

      const tags: ImageTag[] = (img.tags || []).map(t => ({ name: t }));

      images.push({
        namespace: null,
        name: imageName,
        fullName: imageName,
        lastUpdated: this.formatDate(img.uploadTime || img.updateTime),
        availableTags: tags
      });
    }

    return images;
  }

  // ---------------------------------------------------------------------------
  // Tags (Docker v2 API)
  // ---------------------------------------------------------------------------

  async getTags(namespace: string | null, imageName: string): Promise<ImageTag[]> {
    await this.handleRateLimit();
    await this.ensureValidToken();

    const { location, projectId, repositoryName } = this.config;
    const image = namespace ? `${namespace}/${imageName}` : imageName;
    const url = `https://${location}-docker.pkg.dev/v2/${projectId}/${repositoryName}/${image}/tags/list`;

    this.logRequest('GET', url);

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Failed to list tags for ${image}: HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json() as { tags?: string[] };

    return (data.tags || []).map(tag => ({
      name: tag
    }));
  }

  // ---------------------------------------------------------------------------
  // Image metadata
  // ---------------------------------------------------------------------------

  async getImageMetadata(namespace: string | null, imageName: string): Promise<ImageMetadata> {
    const tags = await this.getTags(namespace, imageName);
    return {
      namespace,
      name: imageName,
      tags
    };
  }

  // ---------------------------------------------------------------------------
  // Connection test
  // ---------------------------------------------------------------------------

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      await this.ensureValidToken();

      const { location, projectId, repositoryName } = this.config;
      const url = `https://artifactregistry.googleapis.com/v1/projects/${projectId}/locations/${location}/repositories/${repositoryName}`;

      this.logRequest('GET', url);
      const response = await this.makeAuthenticatedRequest(url);
      const repoData = await response.json() as { name?: string };

      // Also try listing images to get a count
      let repositoryCount = 0;
      try {
        const images = await this.listImages({ limit: 100 });
        repositoryCount = images.length;
      } catch {
        // Non-fatal — repository exists but may be empty
      }

      return {
        success: true,
        message: `Successfully connected to Google Artifact Registry: ${repoData.name || repositoryName}`,
        repositoryCount,
        capabilities: this.getSupportedCapabilities()
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        error: error instanceof Error ? error : new Error('Unknown error')
      };
    }
  }

  // ---------------------------------------------------------------------------
  // canHandle
  // ---------------------------------------------------------------------------

  static canHandle(repository: Repository): boolean {
    if (repository.type === 'GCR') {
      return true;
    }
    const url = (repository.registryUrl || '').toLowerCase();
    return url.includes('.pkg.dev');
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private base64url(input: string | Buffer): string {
    const buf = typeof input === 'string' ? Buffer.from(input) : input;
    return buf.toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }
}
