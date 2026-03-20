#!/bin/bash
# Usage: ./scripts/create-provider.sh ecr "Amazon ECR"

set -e

PROVIDER_KEY="$1"
PROVIDER_NAME="$2"

if [ -z "$PROVIDER_KEY" ] || [ -z "$PROVIDER_NAME" ]; then
  echo "Usage: $0 <provider-key> <provider-name>"
  echo "Example: $0 ecr \"Amazon ECR\""
  exit 1
fi

# Convert key to PascalCase for class name
PROVIDER_CLASS=$(echo "$PROVIDER_KEY" | sed -E 's/(^|_)([a-z])/\U\2/g')Provider

DIR="src/lib/registry/providers/$PROVIDER_KEY"
FILE="$DIR/${PROVIDER_CLASS}.ts"

if [ -d "$DIR" ]; then
  echo "Error: Provider directory $DIR already exists"
  exit 1
fi

mkdir -p "$DIR"

cat > "$FILE" << TEMPLATE
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

// TODO: Define a provider-specific config interface.
// Add any fields your registry requires (API keys, project IDs, etc.).
export interface ${PROVIDER_CLASS}Config extends RegistryConfig {
  username: string;
  password: string;
  registryUrl: string;
}

/**
 * ${PROVIDER_NAME} registry provider.
 *
 * TODO: Describe the authentication mechanism, image listing strategy,
 * and any quirks of this registry.
 */
export class ${PROVIDER_CLASS} extends EnhancedRegistryProvider {
  protected config: ${PROVIDER_CLASS}Config;

  constructor(repository: Repository) {
    super(repository);
    this.config = this.parseConfig(repository) as ${PROVIDER_CLASS}Config;
  }

  // ===========================================================================
  // Provider metadata
  // ===========================================================================

  getProviderName(): string {
    return '${PROVIDER_NAME}';
  }

  getSupportedCapabilities(): RegistryCapability[] {
    // TODO: Return the capabilities your registry supports.
    // Common values: 'LIST_IMAGES', 'GET_TAGS', 'GET_METADATA',
    //   'SEARCH', 'DELETE_IMAGES', 'VULNERABILITY_SCAN'
    return ['LIST_IMAGES', 'GET_TAGS', 'GET_METADATA'];
  }

  getRateLimits(): RateLimit {
    // TODO: Set rate limits appropriate for this registry.
    return {
      requestsPerHour: 1000,
      requestsPerMinute: 60,
      burstLimit: 100
    };
  }

  // ===========================================================================
  // Configuration
  // ===========================================================================

  protected parseConfig(repository: Repository): ${PROVIDER_CLASS}Config {
    // TODO: Parse the Repository record into your provider-specific config.
    // Fields available on Repository:
    //   registryUrl, username, encryptedPassword, organization,
    //   protocol, registryPort, skipTlsVerify, authUrl
    return {
      username: repository.username,
      password: repository.encryptedPassword,
      registryUrl: repository.registryUrl.replace(/^https?:\\/\\//, '').replace(/\\/$/, '')
    };
  }

  validateConfiguration(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // TODO: Add provider-specific validation rules.
    if (!this.config.username?.trim()) {
      errors.push('Username is required');
    }
    if (!this.config.password?.trim()) {
      errors.push('Password is required');
    }
    if (!this.config.registryUrl?.trim()) {
      errors.push('Registry URL is required');
    }

    return { valid: errors.length === 0, errors };
  }

  // ===========================================================================
  // Authentication
  // ===========================================================================

  async getAuthHeaders(): Promise<Record<string, string>> {
    // TODO: Implement authentication headers for HTTP API calls.
    //
    // Common patterns:
    //   Basic auth:  { Authorization: 'Basic <base64(user:pass)>' }
    //   Bearer token: { Authorization: 'Bearer <token>' }
    //
    // If your registry uses token exchange (e.g. Docker v2 token challenge),
    // consider using the built-in handleTokenChallenge() or
    // makeAuthenticatedRequestWithChallenge() helpers from the base class.
    const auth = Buffer.from(
      \`\${this.config.username}:\${this.config.password}\`
    ).toString('base64');
    return { Authorization: \`Basic \${auth}\` };
  }

  async getSkopeoAuthArgs(): Promise<string> {
    // TODO: Return skopeo credential arguments.
    //
    // Common patterns:
    //   Basic auth:    --creds "user:password"
    //   No credentials: --no-creds
    //   Token-based:   --creds "_token:<access_token>"
    if (!this.config.username || !this.config.password) {
      return '--no-creds';
    }
    return \`--creds "\${this.config.username}:\${this.config.password}"\`;
  }

  // ===========================================================================
  // Connection test
  // ===========================================================================

  async testConnection(): Promise<ConnectionTestResult> {
    // TODO: Implement a lightweight check that validates credentials
    // and confirms the registry is reachable.
    //
    // Typical approach: GET /v2/ and verify 200 OK.
    try {
      const baseUrl = this.getBaseUrl();
      const url = \`\${baseUrl}/v2/\`;
      this.logRequest('GET', url);

      const response = await this.makeAuthenticatedRequest(url);

      // Optionally list images to get a count
      let repositoryCount = 0;
      try {
        const images = await this.listImages({ limit: 100 });
        repositoryCount = images.length;
      } catch {
        // catalog may not be accessible
      }

      return {
        success: true,
        message: \`Successfully connected to ${PROVIDER_NAME}\`,
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

  // ===========================================================================
  // Image reference formatting
  // ===========================================================================

  formatFullImageReference(image: string, tag: string): string {
    // TODO: Build a fully qualified image reference for skopeo.
    // Example: "myregistry.example.com/namespace/image:tag"
    const cleanTag = tag || 'latest';
    const registry = this.config.registryUrl;

    // Remove registry prefix from image if already present
    const cleanImage = image.replace(new RegExp(\`^\${registry}/\`), '');

    return \`\${registry}/\${cleanImage}:\${cleanTag}\`;
  }

  // ===========================================================================
  // Image listing
  // ===========================================================================

  async listImages(options: ListImagesOptions = {}): Promise<RegistryImage[]> {
    await this.handleRateLimit();

    // TODO: Implement image listing.
    //
    // Two common approaches:
    //
    // 1. Docker v2 _catalog (ACR, Nexus, Docker Hub):
    //    GET /v2/_catalog -> { repositories: ["image1", "image2"] }
    //
    // 2. Custom REST API (GAR, GitLab, Gitea):
    //    Use a registry-specific endpoint to list images.
    //
    // Example using _catalog:
    const baseUrl = this.getBaseUrl();
    const url = \`\${baseUrl}/v2/_catalog\`;

    this.logRequest('GET', url);
    const response = await this.makeAuthenticatedRequest(url);
    const data = await response.json() as { repositories?: string[] };

    let repositories = data.repositories || [];

    // Apply filters
    if (options.namespace) {
      repositories = repositories.filter((name: string) =>
        name.startsWith(\`\${options.namespace}/\`)
      );
    }
    if (options.query) {
      repositories = repositories.filter((name: string) =>
        name.toLowerCase().includes(options.query!.toLowerCase())
      );
    }
    if (options.offset) {
      repositories = repositories.slice(options.offset);
    }
    if (options.limit) {
      repositories = repositories.slice(0, options.limit);
    }

    return repositories.map((name: string) => {
      const { namespace, imageName } = this.parseImageName(name);
      return {
        namespace,
        name: imageName,
        fullName: name
      };
    });
  }

  // ===========================================================================
  // Image metadata
  // ===========================================================================

  async getImageMetadata(
    namespace: string | null,
    imageName: string
  ): Promise<ImageMetadata> {
    await this.handleRateLimit();

    // TODO: Implement metadata retrieval.
    // At minimum, fetch tags and return them.
    const tags = await this.getTags(namespace, imageName);

    return {
      namespace,
      name: imageName,
      tags
    };
  }

  // ===========================================================================
  // Tags
  // ===========================================================================

  async getTags(
    namespace: string | null,
    imageName: string
  ): Promise<ImageTag[]> {
    await this.handleRateLimit();

    // TODO: Implement tag listing.
    //
    // Standard Docker v2 approach:
    //   GET /v2/<name>/tags/list -> { tags: ["latest", "v1.0"] }
    const fullName = this.buildFullName(namespace, imageName);
    const baseUrl = this.getBaseUrl();
    const url = \`\${baseUrl}/v2/\${fullName}/tags/list\`;

    this.logRequest('GET', url);
    const response = await this.makeAuthenticatedRequest(url);
    const data = await response.json() as { tags?: string[] };

    return (data.tags || []).map((tag: string) => ({
      name: tag,
      size: null,
      created: undefined,
      lastModified: undefined,
      digest: null,
      platform: undefined
    }));
  }

  // ===========================================================================
  // Static detection
  // ===========================================================================

  static canHandle(repository: Repository): boolean {
    // TODO: Return true if this provider can handle the given repository.
    // Check repository.type and/or repository.registryUrl patterns.
    //
    // Example:
    //   return repository.type === 'MY_TYPE' ||
    //          repository.registryUrl?.includes('myregistry.example.com');
    return false;
  }

  // ===========================================================================
  // Private helpers
  // ===========================================================================

  private getBaseUrl(): string {
    const protocol = this.repository.protocol || 'https';
    let url = this.config.registryUrl;
    if (!url.includes('://')) {
      url = \`\${protocol}://\${url}\`;
    }
    return url.replace(/\\/$/, '');
  }
}
TEMPLATE

echo "Created $FILE"
echo ""
echo "Next steps:"
echo "  1. Implement the abstract methods in $FILE"
echo "  2. Register in src/lib/registry/providers/RegistryProviderFactory.ts"
echo "  3. Add UI form fields in src/components/repository-config/"
echo "  4. Add config type in src/lib/registry/types.ts"
echo "  5. Run: npx prisma migrate dev (if new enum value needed)"
