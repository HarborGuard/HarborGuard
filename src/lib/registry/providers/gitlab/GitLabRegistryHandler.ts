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
  gitlabUrl: string;
  projectId?: string;
  groupId?: string;
  token: string; // Personal Access Token or CI Job Token
  tokenType: 'personal' | 'job' | 'deploy';
}

interface GitLabRepository {
  id: number;
  name: string;
  path: string;
  location: string;
  created_at: string;
  tags_count: number;
}

interface GitLabTag {
  name: string;
  path: string;
  location: string;
  digest: string;
  revision: string;
  short_revision: string;
  total_size: number;
  created_at: string;
}

export class GitLabRegistryHandler extends EnhancedRegistryProvider {
  protected config: GitLabConfig;
  private apiBaseUrl: string;
  
  constructor(repository: Repository) {
    super(repository);
    this.config = this.parseConfig(repository) as GitLabConfig;
    this.apiBaseUrl = `${this.config.gitlabUrl}/api/v4`;
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
    // Parse GitLab-specific configuration from repository data
    const gitlabUrl = repository.registryUrl.replace('/registry', '');
    
    return {
      gitlabUrl,
      projectId: repository.organization || undefined, // Could store project ID in organization field
      token: repository.encryptedPassword, // Should be decrypted
      tokenType: repository.username === 'gitlab-ci-token' ? 'job' : 'personal',
      registryUrl: repository.registryUrl,
      username: repository.username,
      password: repository.encryptedPassword
    };
  }
  
  async getSkopeoAuthArgs(): Promise<string> {
    // GitLab supports both username/password and token auth
    const username = this.config.tokenType === 'job' ? 'gitlab-ci-token' : this.config.username;
    const password = this.config.token;
    
    // Escape credentials
    const escapedUsername = username.replace(/"/g, '\\"');
    const escapedPassword = password.replace(/"/g, '\\"');
    
    return `--creds "${escapedUsername}:${escapedPassword}"`;
  }
  
  async getAuthHeaders(): Promise<Record<string, string>> {
    if (this.config.tokenType === 'personal') {
      return {
        'PRIVATE-TOKEN': this.config.token
      };
    } else {
      // For job tokens, use Bearer auth
      return {
        'Authorization': `Bearer ${this.config.token}`
      };
    }
  }
  
  async testConnection(): Promise<ConnectionTestResult> {
    try {
      // Test the GitLab API connection
      const projectUrl = this.config.projectId 
        ? `${this.apiBaseUrl}/projects/${this.config.projectId}`
        : `${this.apiBaseUrl}/version`;
      
      const response = await this.makeAuthenticatedRequest(projectUrl);
      const data = await response.json();
      
      // Try to list container repositories
      if (this.config.projectId) {
        const reposUrl = `${this.apiBaseUrl}/projects/${this.config.projectId}/registry/repositories`;
        await this.makeAuthenticatedRequest(reposUrl);
      }
      
      return {
        success: true,
        message: `Successfully connected to GitLab Container Registry (version: ${data.version || 'unknown'})`,
        capabilities: this.getSupportedCapabilities()
      };
    } catch (error: any) {
      return {
        success: false,
        message: `GitLab connection failed: ${error.message}`,
        error: error.message
      };
    }
  }
  
  async listImages(options?: ListImagesOptions): Promise<RegistryImage[]> {
    if (!this.config.projectId) {
      throw new Error('Project ID is required to list images');
    }
    
    const url = `${this.apiBaseUrl}/projects/${this.config.projectId}/registry/repositories`;
    const response = await this.makeAuthenticatedRequest(url);
    const repositories: GitLabRepository[] = await response.json();
    
    const images: RegistryImage[] = [];
    
    for (const repo of repositories) {
      // Get tags for each repository
      const tagsUrl = `${this.apiBaseUrl}/projects/${this.config.projectId}/registry/repositories/${repo.id}/tags`;
      const tagsResponse = await this.makeAuthenticatedRequest(tagsUrl);
      const tags: GitLabTag[] = await tagsResponse.json();
      
      images.push({
        name: repo.path,
        fullName: `${this.config.projectId}/${repo.path}`,
        namespace: this.config.projectId,
        description: `GitLab repository ${repo.name}`,
        isPrivate: true, // GitLab registries are private by default
        starCount: 0,
        pullCount: 0,
        lastUpdated: new Date(repo.created_at)
      });
    }
    
    return images;
  }
  
  async getTags(namespace: string | null, imageName: string): Promise<ImageTag[]> {
    if (!this.config.projectId) {
      throw new Error('Project ID is required to get tags');
    }
    
    // First, find the repository ID
    const reposUrl = `${this.apiBaseUrl}/projects/${this.config.projectId}/registry/repositories`;
    const reposResponse = await this.makeAuthenticatedRequest(reposUrl);
    const repositories: GitLabRepository[] = await reposResponse.json();
    
    const repo = repositories.find(r => r.path === imageName || r.name === imageName);
    if (!repo) {
      throw new Error(`Repository ${imageName} not found`);
    }
    
    // Get tags for the repository
    const tagsUrl = `${this.apiBaseUrl}/projects/${this.config.projectId}/registry/repositories/${repo.id}/tags`;
    const tagsResponse = await this.makeAuthenticatedRequest(tagsUrl);
    const tags: GitLabTag[] = await tagsResponse.json();
    
    return tags.map(tag => ({
      name: tag.name,
      digest: tag.digest,
      size: tag.total_size,
      created: new Date(tag.created_at),
      lastModified: new Date(tag.created_at)
    }));
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
    if (!this.config.projectId) {
      throw new Error('Project ID is required to delete images');
    }
    
    // Find the repository
    const reposUrl = `${this.apiBaseUrl}/projects/${this.config.projectId}/registry/repositories`;
    const reposResponse = await this.makeAuthenticatedRequest(reposUrl);
    const repositories: GitLabRepository[] = await reposResponse.json();
    
    const repo = repositories.find(r => r.path === image || r.name === image);
    if (!repo) {
      throw new Error(`Repository ${image} not found`);
    }
    
    // Delete the specific tag
    const deleteUrl = `${this.apiBaseUrl}/projects/${this.config.projectId}/registry/repositories/${repo.id}/tags/${tag}`;
    await this.makeAuthenticatedRequest(deleteUrl, { method: 'DELETE' });
    
    logger.info(`Deleted image ${image}:${tag} from GitLab registry`);
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