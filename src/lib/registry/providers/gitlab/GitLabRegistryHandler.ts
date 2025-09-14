import type { Repository } from '@/generated/prisma';
import { EnhancedRegistryProvider, type ImageInspection } from '../base/EnhancedRegistryProvider';
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

interface GitLabConfig extends RegistryConfig {
  registryUrl: string;  // Base registry URL (e.g., https://104.236.206.145:5050)
  authUrl: string;      // JWT auth endpoint (e.g., https://104.236.206.145/jwt/auth)
  username: string;     // Admin username for authentication
  password: string;     // Admin password for authentication
  projectId?: string;
  groupId?: string;
}

interface GitLabCatalogResponse {
  repositories: string[];
}

interface GitLabTagsResponse {
  name: string;
  tags: string[];
}

interface DockerManifest {
  schemaVersion: number;
  name: string;
  tag: string;
  architecture?: string;
  fsLayers?: Array<{ blobSum: string }>;
  history?: Array<{ v1Compatibility: string }>;
  config?: {
    size: number;
    digest: string;
  };
  layers?: Array<{
    size: number;
    digest: string;
  }>;
}

interface JWTTokenResponse {
  token: string;
  expires_in?: number;
  issued_at?: string;
}

export class GitLabRegistryHandler extends EnhancedRegistryProvider {
  protected config: GitLabConfig;
  private jwtToken: string | null = null;
  private tokenExpiry: Date | null = null;
  
  constructor(repository: Repository) {
    super(repository);
    this.config = this.parseConfig(repository) as GitLabConfig;
  }
  
  getProviderName(): string {
    return 'GitLab Container Registry';
  }
  
  getSupportedCapabilities(): RegistryCapability[] {
    return [
      'LIST_IMAGES',
      'GET_TAGS',
      'GET_METADATA',
      'DELETE_IMAGES',
      'CLEANUP_POLICIES',
      'VULNERABILITY_SCANNING'
    ];
  }
  
  getRateLimits(): RateLimit {
    return {
      requestsPerHour: 36000, // 600 per minute = 36000 per hour
      requestsPerMinute: 600, // GitLab has 600 requests per minute for authenticated users
      burstLimit: 100
    };
  }
  
  protected parseConfig(repository: Repository): GitLabConfig {
    // Parse GitLab Registry V2 configuration
    // Expecting registryUrl format: https://host:port
    // Auth URL should be stored in a custom field or derived from registryUrl
    const registryUrl = repository.registryUrl;
    const authUrl = repository.authUrl || `${registryUrl.replace(':5050', '')}/jwt/auth`;
    
    return {
      registryUrl,
      authUrl,
      username: repository.username,
      password: repository.encryptedPassword, // Should be decrypted in production
      projectId: repository.organization || undefined,
      groupId: repository.groupId || undefined
    };
  }
  
  async getSkopeoAuthArgs(): Promise<string> {
    // For GitLab Registry V2, we use basic auth with username/password
    // The registry will handle JWT token exchange internally
    const escapedUsername = this.config.username.replace(/"/g, '\\"');
    const escapedPassword = this.config.password.replace(/"/g, '\\"');
    
    return `--creds "${escapedUsername}:${escapedPassword}" --tls-verify=false`;
  }
  
  /**
   * Get JWT token for registry authentication
   */
  private async getJWTToken(scope?: string): Promise<string> {
    // Check if we have a valid cached token
    if (this.jwtToken && this.tokenExpiry && this.tokenExpiry > new Date()) {
      return this.jwtToken;
    }

    // Request new JWT token
    const authUrl = new URL(this.config.authUrl);
    authUrl.searchParams.append('service', 'container_registry');
    if (scope) {
      authUrl.searchParams.append('scope', scope);
    } else {
      // Default scope for catalog access
      authUrl.searchParams.append('scope', 'registry:catalog:*');
    }

    const auth = Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64');
    
    const response = await fetch(authUrl.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to get JWT token: ${response.status} ${response.statusText}`);
    }

    const data: JWTTokenResponse = await response.json();
    this.jwtToken = data.token;
    
    // Set token expiry (default to 5 minutes if not provided)
    const expiresIn = data.expires_in || 300;
    this.tokenExpiry = new Date(Date.now() + expiresIn * 1000);
    
    return data.token;
  }

  async getAuthHeaders(): Promise<Record<string, string>> {
    const token = await this.getJWTToken();
    return {
      'Authorization': `Bearer ${token}`
    };
  }
  
  async testConnection(): Promise<ConnectionTestResult> {
    try {
      // Test connection by getting JWT token and listing catalog
      const token = await this.getJWTToken('registry:catalog:*');
      
      // Test catalog endpoint
      const catalogUrl = `${this.config.registryUrl}/v2/_catalog?n=1`;
      const response = await fetch(catalogUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Registry returned ${response.status}: ${response.statusText}`);
      }
      
      const data: GitLabCatalogResponse = await response.json();
      const repoCount = data.repositories?.length || 0;
      
      return {
        success: true,
        message: `Successfully connected to GitLab Container Registry`,
        repositoryCount: repoCount,
        capabilities: this.getSupportedCapabilities()
      };
    } catch (error: any) {
      return {
        success: false,
        message: `GitLab Registry connection failed: ${error.message}`,
        error: error.message
      };
    }
  }
  
  async listImages(options?: ListImagesOptions): Promise<RegistryImage[]> {
    const images: RegistryImage[] = [];
    const limit = options?.limit || 100;
    let lastRepo: string | undefined;
    let hasMore = true;
    
    // Get JWT token with catalog scope
    const token = await this.getJWTToken('registry:catalog:*');
    
    while (hasMore && images.length < limit) {
      // Build catalog URL with pagination
      let catalogUrl = `${this.config.registryUrl}/v2/_catalog?n=${limit}`;
      if (lastRepo) {
        catalogUrl += `&last=${lastRepo}`;
      }
      
      const response = await fetch(catalogUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to list repositories: ${response.status} ${response.statusText}`);
      }
      
      const data: GitLabCatalogResponse = await response.json();
      
      if (!data.repositories || data.repositories.length === 0) {
        hasMore = false;
        break;
      }
      
      // Process each repository
      for (const repoName of data.repositories) {
        // Parse namespace and image name
        const parts = repoName.split('/');
        const namespace = parts.length > 1 ? parts.slice(0, -1).join('/') : null;
        const imageName = parts[parts.length - 1];
        
        images.push({
          name: imageName,
          fullName: repoName,
          namespace: namespace,
          description: `GitLab Registry image: ${repoName}`,
          isPrivate: true, // GitLab registries are private by default
          starCount: 0,
          pullCount: 0,
          lastUpdated: new Date()
        });
      }
      
      // Check for more pages via Link header
      const linkHeader = response.headers.get('Link');
      if (linkHeader && linkHeader.includes('rel="next"')) {
        lastRepo = data.repositories[data.repositories.length - 1];
      } else {
        hasMore = false;
      }
      
      // Also check if we got fewer results than requested
      if (data.repositories.length < limit) {
        hasMore = false;
      }
    }
    
    return images;
  }
  
  async getTags(namespace: string | null, imageName: string): Promise<ImageTag[]> {
    // Construct full repository name
    const repoName = namespace ? `${namespace}/${imageName}` : imageName;
    
    // Get JWT token with repository scope
    const token = await this.getJWTToken(`repository:${repoName}:pull`);
    
    const tags: ImageTag[] = [];
    let lastTag: string | undefined;
    let hasMore = true;
    const limit = 100;
    
    while (hasMore) {
      // Build tags list URL with pagination
      let tagsUrl = `${this.config.registryUrl}/v2/${repoName}/tags/list?n=${limit}`;
      if (lastTag) {
        tagsUrl += `&last=${lastTag}`;
      }
      
      const response = await fetch(tagsUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        if (response.status === 404) {
          // Repository doesn't exist or has no tags
          return [];
        }
        throw new Error(`Failed to list tags: ${response.status} ${response.statusText}`);
      }
      
      const data: GitLabTagsResponse = await response.json();
      
      if (!data.tags || data.tags.length === 0) {
        hasMore = false;
        break;
      }
      
      // Get manifest for each tag to get more details
      for (const tagName of data.tags) {
        try {
          const manifestUrl = `${this.config.registryUrl}/v2/${repoName}/manifests/${tagName}`;
          const manifestResponse = await fetch(manifestUrl, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Accept': 'application/vnd.docker.distribution.manifest.v2+json'
            }
          });
          
          if (manifestResponse.ok) {
            const manifest: DockerManifest = await manifestResponse.json();
            const digest = manifestResponse.headers.get('Docker-Content-Digest');
            
            // Calculate total size from layers
            let totalSize = 0;
            if (manifest.layers) {
              totalSize = manifest.layers.reduce((sum, layer) => sum + (layer.size || 0), 0);
            }
            
            tags.push({
              name: tagName,
              digest: digest || undefined,
              size: totalSize || undefined,
              created: new Date(), // Would need to parse from manifest history
              lastModified: new Date()
            });
          } else {
            // Fallback if we can't get manifest
            tags.push({
              name: tagName,
              created: new Date(),
              lastModified: new Date()
            });
          }
        } catch (error) {
          logger.warn(`Failed to get manifest for ${repoName}:${tagName}`, error);
          tags.push({
            name: tagName,
            created: new Date(),
            lastModified: new Date()
          });
        }
      }
      
      // Check for more pages
      const linkHeader = response.headers.get('Link');
      if (linkHeader && linkHeader.includes('rel="next"')) {
        lastTag = data.tags[data.tags.length - 1];
      } else {
        hasMore = false;
      }
      
      if (data.tags.length < limit) {
        hasMore = false;
      }
    }
    
    return tags;
  }
  
  async getImageMetadata(namespace: string | null, imageName: string): Promise<ImageMetadata> {
    const tags = await this.getTags(namespace, imageName);
    
    return {
      name: imageName,
      namespace: namespace || this.config.projectId || null,
      description: `GitLab container image ${imageName}`,
      tags,
      isPrivate: true,
      starCount: 0,
      pullCount: 0,
      lastUpdated: tags.length > 0 ? tags[0].created : new Date()
    };
  }
  
  async deleteImage(image: string, tag: string): Promise<void> {
    // Get JWT token with delete scope
    const token = await this.getJWTToken(`repository:${image}:delete`);
    
    // First get the manifest digest
    const manifestUrl = `${this.config.registryUrl}/v2/${image}/manifests/${tag}`;
    const manifestResponse = await fetch(manifestUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.docker.distribution.manifest.v2+json'
      }
    });
    
    if (!manifestResponse.ok) {
      throw new Error(`Failed to get manifest for deletion: ${manifestResponse.status}`);
    }
    
    const digest = manifestResponse.headers.get('Docker-Content-Digest');
    if (!digest) {
      throw new Error('Could not get digest for image deletion');
    }
    
    // Delete by digest
    const deleteUrl = `${this.config.registryUrl}/v2/${image}/manifests/${digest}`;
    const deleteResponse = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!deleteResponse.ok && deleteResponse.status !== 202) {
      throw new Error(`Failed to delete image: ${deleteResponse.status} ${deleteResponse.statusText}`);
    }
    
    logger.info(`Deleted image ${image}:${tag} from GitLab registry`);
  }
  
  /**
   * Export image data for backup or migration
   */
  async exportImageData(image: string, tag: string): Promise<{
    manifest: any;
    config: any;
    layers: Array<{ digest: string; size: number }>;
  }> {
    const token = await this.getJWTToken(`repository:${image}:pull`);
    
    // Get manifest
    const manifestUrl = `${this.config.registryUrl}/v2/${image}/manifests/${tag}`;
    const manifestResponse = await fetch(manifestUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.docker.distribution.manifest.v2+json'
      }
    });
    
    if (!manifestResponse.ok) {
      throw new Error(`Failed to get manifest: ${manifestResponse.status}`);
    }
    
    const manifest = await manifestResponse.json();
    
    // Get config blob if available
    let config = null;
    if (manifest.config?.digest) {
      const configUrl = `${this.config.registryUrl}/v2/${image}/blobs/${manifest.config.digest}`;
      const configResponse = await fetch(configUrl, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (configResponse.ok) {
        config = await configResponse.json();
      }
    }
    
    // Extract layer information
    const layers = manifest.layers?.map((layer: any) => ({
      digest: layer.digest,
      size: layer.size || 0
    })) || [];
    
    return {
      manifest,
      config,
      layers
    };
  }

  /**
   * Rescan an image to refresh its metadata and security status
   */
  async rescanImage(namespace: string | null, imageName: string, tag: string): Promise<void> {
    // For GitLab Registry V2, rescanning involves:
    // 1. Re-fetching the manifest and metadata
    // 2. Triggering a new security scan if configured
    
    const fullImageName = namespace ? `${namespace}/${imageName}` : imageName;
    
    // Get fresh manifest
    const exportData = await this.exportImageData(fullImageName, tag);
    
    logger.info(`Rescanned image ${fullImageName}:${tag}`, {
      manifestDigest: exportData.manifest?.config?.digest,
      layerCount: exportData.layers.length,
      totalSize: exportData.layers.reduce((sum, l) => sum + l.size, 0)
    });
    
    // Note: Actual security scanning would be triggered by the caller
    // This method just ensures we have fresh registry data
  }

  // ===== GitLab-Specific Features =====
  
  /**
   * Set up container expiration policy for automatic cleanup
   */
  async setupCleanupPolicy(policy: {
    enabled: boolean;
    cadence: string; // '1d', '7d', '14d', '1month', '3month'
    keepN?: number;
    olderThan?: string; // '7d', '14d', '30d', '90d'
    nameRegexDelete?: string;
    nameRegexKeep?: string;
  }): Promise<void> {
    if (!this.config.projectId) {
      throw new Error('Project ID is required to set cleanup policy');
    }
    
    const url = `${this.apiBaseUrl}/projects/${this.config.projectId}`;
    
    await this.makeAuthenticatedRequest(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        container_expiration_policy_attributes: {
          enabled: policy.enabled,
          cadence: policy.cadence,
          keep_n: policy.keepN,
          older_than: policy.olderThan,
          name_regex_delete: policy.nameRegexDelete,
          name_regex_keep: policy.nameRegexKeep
        }
      })
    });
    
    logger.info(`Updated GitLab container expiration policy for project ${this.config.projectId}`);
  }
  
  /**
   * Get vulnerability report for an image (requires GitLab Ultimate)
   */
  async getVulnerabilityReport(image: string, tag: string): Promise<any> {
    if (!this.config.projectId) {
      throw new Error('Project ID is required for vulnerability scanning');
    }
    
    // This would require GitLab Ultimate and proper pipeline setup
    const url = `${this.apiBaseUrl}/projects/${this.config.projectId}/vulnerability_findings`;
    
    try {
      const response = await this.makeAuthenticatedRequest(url);
      const findings = await response.json();
      
      // Filter findings for the specific image/tag
      return findings.filter((finding: any) => 
        finding.location?.image === `${image}:${tag}`
      );
    } catch (error) {
      logger.warn('Vulnerability scanning may not be available', error);
      return [];
    }
  }
  
  /**
   * Trigger a new pipeline for an image build
   */
  async triggerPipeline(ref: string, variables?: Record<string, string>): Promise<void> {
    if (!this.config.projectId) {
      throw new Error('Project ID is required to trigger pipeline');
    }
    
    const url = `${this.apiBaseUrl}/projects/${this.config.projectId}/pipeline`;
    
    await this.makeAuthenticatedRequest(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ref,
        variables: Object.entries(variables || {}).map(([key, value]) => ({
          key,
          value
        }))
      })
    });
    
    logger.info(`Triggered GitLab pipeline for ref ${ref}`);
  }
  
  /**
   * Get detailed size breakdown of an image
   */
  async getImageSizeDetails(image: string, tag: string): Promise<{
    totalSize: number;
    layers: Array<{ digest: string; size: number }>;
  }> {
    // Use skopeo inspect to get detailed manifest
    const inspection = await this.inspectImage(image, tag);
    
    return {
      totalSize: inspection.layers.reduce((sum, layer) => sum + (layer.size || 0), 0),
      layers: inspection.layers.map(layer => ({
        digest: layer.digest,
        size: layer.size || 0
      }))
    };
  }
}