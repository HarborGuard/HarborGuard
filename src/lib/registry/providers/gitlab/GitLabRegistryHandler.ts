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

interface GitLabConfig extends RegistryConfig {
  registryUrl: string;  // Base registry URL (e.g., https://104.236.206.145:5050)
  authUrl: string;      // JWT auth endpoint (e.g., https://104.236.206.145/jwt/auth)
  username: string;     // Admin username for authentication
  password: string;     // Admin password for authentication
  projectId?: string;
  groupId?: string;
  skipTlsVerify?: boolean; // Skip TLS verification for self-signed certificates
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
    
    // Update the repository object with the correct registry URL that includes the port
    // This is needed because the base class uses this.repository.registryUrl
    this.repository = {
      ...this.repository,
      registryUrl: this.config.registryUrl
    };
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
    // The user enters the GitLab instance URL (e.g., https://24.199.119.91)
    // We need to determine the registry URL and auth URL from this
    
    logger.info('[GitLab] Parsing configuration', {
      inputUrl: repository.registryUrl,
      hasCustomPort: !!repository.registryPort,
      customPort: repository.registryPort,
      hasAuthUrl: !!repository.authUrl,
      skipTlsVerify: repository.skipTlsVerify
    });
    
    let registryUrl = repository.registryUrl;
    let authUrl = repository.authUrl;
    
    try {
      // Add default protocol if missing
      let urlToParse = repository.registryUrl;
      if (!urlToParse.startsWith('http://') && !urlToParse.startsWith('https://')) {
        urlToParse = `https://${urlToParse}`;
      }
      
      const inputUrl = new URL(urlToParse);
      
      // Parse the URL to determine registry configuration
      
      // Check if user provided a custom registry port
      if (repository.registryPort) {
        // User explicitly specified a registry port
        registryUrl = `http://${inputUrl.hostname}:${repository.registryPort}`;
        authUrl = authUrl || `${inputUrl.protocol}//${inputUrl.hostname}/jwt/auth`;
        logger.info('[GitLab] Using custom registry port', {
          registryUrl,
          authUrl
        });
      } else if (!inputUrl.port || inputUrl.port === '443' || inputUrl.port === '80') {
        // No port specified or using standard ports, assume registry is on port 5050
        // GitLab registry typically runs on port 5050 with HTTP
        // For standard GitLab installations:
        // - Auth endpoint: https://host/jwt/auth
        // - Registry endpoint: http://host:5050
        
        const defaultPort = 5050; // Default GitLab registry port
        registryUrl = `http://${inputUrl.hostname}:${defaultPort}`;
        authUrl = `${inputUrl.protocol}//${inputUrl.hostname}/jwt/auth`;
        logger.info('[GitLab] Using default port configuration', {
          registryUrl,
          authUrl,
          defaultPort
        });
      } else if (inputUrl.port === '5050' || inputUrl.port === '5000') {
        // User specified the registry port directly in the URL
        // Assume HTTP for registry port
        registryUrl = `http://${inputUrl.hostname}:${inputUrl.port}`;
        authUrl = `https://${inputUrl.hostname}/jwt/auth`;
        logger.info('[GitLab] Registry port detected in URL', {
          registryUrl,
          authUrl,
          detectedPort: inputUrl.port
        });
      } else {
        // Keep the URL as-is if it has a non-standard port
        registryUrl = repository.registryUrl;
        authUrl = authUrl || `${inputUrl.protocol}//${inputUrl.hostname}/jwt/auth`;
        logger.info('[GitLab] Using non-standard port configuration', {
          registryUrl,
          authUrl
        });
      }
      
      // Override with explicit authUrl if provided
      if (repository.authUrl) {
        authUrl = repository.authUrl;
        logger.info('[GitLab] Using explicit auth URL', { authUrl });
      }
    } catch (e) {
      logger.error('[GitLab] Failed to parse URL', {
        error: e instanceof Error ? e.message : String(e),
        registryUrl: repository.registryUrl
      });
      // If URL parsing fails, try to make reasonable defaults
      if (!authUrl) {
        authUrl = `${registryUrl.replace(/:\d+$/, '')}/jwt/auth`;
      }
    }
    
    const config = {
      registryUrl,
      authUrl,
      username: repository.username,
      password: repository.encryptedPassword, // Should be decrypted in production
      projectId: repository.organization || undefined,
      groupId: repository.groupId || undefined,
      skipTlsVerify: repository.skipTlsVerify || false
    };
    
    logger.info('[GitLab] Final configuration', {
      registryUrl: config.registryUrl,
      authUrl: config.authUrl,
      username: config.username,
      hasPassword: !!config.password,
      skipTlsVerify: config.skipTlsVerify
    });
    
    return config;
  }
  
  async getSkopeoAuthArgs(): Promise<string> {
    // For GitLab Registry V2, we use basic auth with username/password
    // The registry will handle JWT token exchange internally
    const escapedUsername = this.config.username.replace(/"/g, '\\"');
    const escapedPassword = this.config.password.replace(/"/g, '\\"');
    
    const tlsVerify = this.config.skipTlsVerify ? '--tls-verify=false' : '';
    return `--creds "${escapedUsername}:${escapedPassword}" ${tlsVerify}`.trim();
  }
  
  /**
   * Get JWT token for registry authentication
   */
  private async getJWTToken(scope?: string): Promise<string> {
    // Check if we have a valid cached token
    if (this.jwtToken && this.tokenExpiry && this.tokenExpiry > new Date()) {
      logger.debug('[GitLab] Using cached JWT token', {
        expiresAt: this.tokenExpiry.toISOString()
      });
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

    logger.info('[GitLab] Requesting JWT token', {
      authUrl: authUrl.toString(),
      service: 'container_registry',
      scope: scope || 'registry:catalog:*',
      username: this.config.username
    });

    const auth = Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64');
    
    // Create fetch options with conditional TLS verification
    const fetchOptions: any = {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json'
      }
    };
    
    // For self-signed certificates, we need to use a custom agent in Node.js
    if (this.config.skipTlsVerify && typeof process !== 'undefined') {
      // Temporarily disable TLS verification for this request
      // Store the original value to restore it later
      const originalRejectUnauthorized = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
      logger.warn('[GitLab] TLS verification disabled for JWT auth request (NODE_TLS_REJECT_UNAUTHORIZED=0)');
      
      try {
        // Send JWT auth request with TLS verification disabled
        
        const response = await fetch(authUrl.toString(), fetchOptions);
        
        // Restore the original value
        if (originalRejectUnauthorized === undefined) {
          delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
        } else {
          process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalRejectUnauthorized;
        }
        
        return await this.handleJWTResponse(response, authUrl.toString());
      } catch (error) {
        // Restore the original value even on error
        if (originalRejectUnauthorized === undefined) {
          delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
        } else {
          process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalRejectUnauthorized;
        }
        throw error;
      }
    } else {
      // Send JWT auth request with normal TLS verification
      
      const response = await fetch(authUrl.toString(), fetchOptions);
      return await this.handleJWTResponse(response, authUrl.toString());
    }
  }
  
  private async handleJWTResponse(response: Response, authUrl: string): Promise<string> {
    // Process JWT auth response

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error('[GitLab] Failed to get JWT token', {
        status: response.status,
        statusText: response.statusText,
        body: errorBody,
        authUrl: authUrl
      });
      throw new Error(`Failed to get JWT token: ${response.status} ${response.statusText}`);
    }

    const data: JWTTokenResponse = await response.json();
    this.jwtToken = data.token;
    
    // Set token expiry (default to 5 minutes if not provided)
    const expiresIn = data.expires_in || 300;
    this.tokenExpiry = new Date(Date.now() + expiresIn * 1000);
    
    logger.info('[GitLab] JWT token obtained', {
      expiresIn,
      expiresAt: this.tokenExpiry.toISOString(),
      tokenLength: data.token.length
    });
    
    return data.token;
  }

  async getAuthHeaders(): Promise<Record<string, string>> {
    const token = await this.getJWTToken();
    return {
      'Authorization': `Bearer ${token}`
    };
  }
  
  async testConnection(): Promise<ConnectionTestResult> {
    logger.info('[GitLab] Starting connection test', {
      registryUrl: this.config.registryUrl,
      authUrl: this.config.authUrl,
      username: this.config.username,
      skipTlsVerify: this.config.skipTlsVerify
    });
    
    try {
      // Test connection by getting JWT token and listing catalog
      logger.debug('[GitLab] Requesting JWT token for catalog access');
      const token = await this.getJWTToken('registry:catalog:*');
      logger.debug('[GitLab] JWT token obtained successfully', {
        tokenLength: token.length,
        tokenPrefix: token.substring(0, 20) + '...'
      });
      
      // Test catalog endpoint
      const catalogUrl = `${this.config.registryUrl}/v2/_catalog?n=1`;
      logger.info('[GitLab] Testing catalog endpoint', { catalogUrl });
      
      // Note: The catalog endpoint is on HTTP, so no TLS issues
      // But we'll keep the same pattern for consistency
      const response = await fetch(catalogUrl, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });
      
      logger.debug('[GitLab] Catalog response received', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      });
      
      if (!response.ok) {
        const errorBody = await response.text();
        logger.error('[GitLab] Registry returned error', {
          status: response.status,
          statusText: response.statusText,
          body: errorBody
        });
        throw new Error(`Registry returned ${response.status}: ${response.statusText}`);
      }
      
      const data: GitLabCatalogResponse = await response.json();
      const repoCount = data.repositories?.length || 0;
      
      logger.info('[GitLab] Connection test successful', {
        repositoryCount: repoCount,
        repositories: data.repositories
      });
      
      return {
        success: true,
        message: `Successfully connected to GitLab Container Registry${this.config.skipTlsVerify ? ' (TLS verification disabled)' : ''}`,
        repositoryCount: repoCount,
        capabilities: this.getSupportedCapabilities()
      };
    } catch (error: any) {
      logger.error('[GitLab] Connection test failed', {
        error: error.message,
        stack: error.stack,
        registryUrl: this.config.registryUrl,
        authUrl: this.config.authUrl
      });
      
      // Provide helpful message for SSL errors
      if (error.message.includes('SSL') || error.message.includes('certificate')) {
        return {
          success: false,
          message: `SSL/TLS error: ${error.message}. Try enabling 'Skip TLS Verification' for self-signed certificates.`,
          error: error.message
        };
      }
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

}