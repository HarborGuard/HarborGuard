# Adding a New Registry Provider

This guide walks through adding support for a new container registry in HarborGuard.

## Quick Start

Run the scaffold script to generate the boilerplate:

```bash
./scripts/create-provider.sh <provider-key> "<Provider Name>"

# Examples:
./scripts/create-provider.sh ecr "Amazon ECR"
./scripts/create-provider.sh harbor "Harbor Registry"
./scripts/create-provider.sh jfrog "JFrog Artifactory"
```

This creates `src/lib/registry/providers/<provider-key>/<ProviderClass>.ts` with all abstract methods stubbed and TODO comments explaining what each one should do.

## File Structure

A complete registry integration touches these files:

| File | Purpose |
|------|---------|
| `src/lib/registry/providers/<key>/<Class>.ts` | Provider implementation (scaffold creates this) |
| `src/lib/registry/providers/RegistryProviderFactory.ts` | Register provider in factory |
| `src/lib/registry/types.ts` | Add config interface (e.g. `ECRConfig`) |
| `prisma/schema.prisma` | Add enum value to `RepositoryType` if needed |
| `src/components/repository-config/` | Add UI form for registry-specific fields |

## Authentication Patterns

Each registry handles auth differently. Below are the four patterns used across existing providers, with code examples.

### Basic Auth (ACR, Nexus, Generic OCI)

The simplest approach. Send `username:password` as a Base64-encoded header.

```typescript
// getAuthHeaders()
async getAuthHeaders(): Promise<Record<string, string>> {
  const auth = Buffer.from(
    `${this.config.username}:${this.config.password}`
  ).toString('base64');
  return { Authorization: `Basic ${auth}` };
}

// getSkopeoAuthArgs()
async getSkopeoAuthArgs(): Promise<string> {
  return `--creds "${this.config.username}:${this.config.password}"`;
}
```

### Bearer Token with Refresh (Docker Hub, GHCR)

Use a token directly as a Bearer header. GHCR uses a GitHub PAT; Docker Hub uses a JWT obtained from `hub.docker.com/v2/users/login`.

```typescript
// getAuthHeaders()
async getAuthHeaders(): Promise<Record<string, string>> {
  return {
    Authorization: `Bearer ${this.config.token}`,
    Accept: 'application/vnd.github.v3+json'
  };
}

// getSkopeoAuthArgs()
async getSkopeoAuthArgs(): Promise<string> {
  return `--creds "${this.config.username}:${this.config.token}"`;
}
```

### Docker v2 Token Challenge (Gitea, Generic OCI, standard registries)

When a registry returns `401` with a `Www-Authenticate: Bearer realm="...",service="...",scope="..."` header, you must exchange credentials at the token endpoint to get a short-lived bearer token.

The base class provides two helpers for this:

- `handleTokenChallenge(response)` -- parses the `Www-Authenticate` header, calls the token endpoint with Basic auth, and returns the bearer token.
- `makeAuthenticatedRequestWithChallenge(url, options?)` -- wraps a fetch call; if the initial request returns 401, it automatically performs the token exchange and retries.

```typescript
// Use in listImages, getTags, etc. instead of makeAuthenticatedRequest():
async listImages(options: ListImagesOptions = {}): Promise<RegistryImage[]> {
  const url = `${this.getBaseUrl()}/v2/_catalog`;
  const response = await this.makeAuthenticatedRequestWithChallenge(url);
  const data = await response.json();
  // ...
}
```

If you need manual control over the token exchange:

```typescript
async testConnection(): Promise<ConnectionTestResult> {
  const url = `${this.getBaseUrl()}/v2/`;
  const headers = await this.getAuthHeaders();
  const response = await fetch(url, { headers });

  if (response.status === 401) {
    const token = await this.handleTokenChallenge(response);
    if (token) {
      const retry = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (retry.ok) {
        return { success: true, message: 'Connected via token challenge' };
      }
    }
    return { success: false, message: 'Authentication failed' };
  }

  return { success: true, message: 'Connected' };
}
```

### OAuth2 JWT Grant (GAR)

Google Artifact Registry uses a GCP service account JSON key to sign a JWT, exchanges it at `https://oauth2.googleapis.com/token`, and uses the resulting access token. Override `refreshAuth()` to implement the token exchange, and cache the token with an expiry.

```typescript
private accessToken?: string;
private tokenExpiry?: Date;

async refreshAuth(): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: this.config.clientEmail,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  };

  // Sign JWT with RSA-SHA256 using the service account private key
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(`${base64url(header)}.${base64url(payload)}`);
  const signature = sign.sign(this.config.privateKey);
  const signedJwt = `${base64url(header)}.${base64url(payload)}.${base64url(signature)}`;

  // Exchange for access token
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: signedJwt
    }).toString()
  });

  const data = await response.json();
  this.accessToken = data.access_token;
  this.tokenExpiry = new Date(Date.now() + (data.expires_in - 60) * 1000);
}

async getSkopeoAuthArgs(): Promise<string> {
  await this.ensureValidToken();
  return `--creds "_dcgcloud_token:${this.accessToken}"`;
}
```

## Image Listing

There are two main approaches for listing images in a registry.

### Docker v2 `_catalog` (ACR, Nexus, Docker Hub, Generic OCI)

The standard Docker Registry v2 API exposes `GET /v2/_catalog` which returns a list of repository names. This works for most registries that implement the Docker distribution spec.

```typescript
async listImages(options: ListImagesOptions = {}): Promise<RegistryImage[]> {
  const url = `${this.getBaseUrl()}/v2/_catalog`;
  const response = await this.makeAuthenticatedRequest(url);
  const data = await response.json();

  let repositories: string[] = data.repositories || [];

  // Apply filters
  if (options.namespace) {
    repositories = repositories.filter(name =>
      name.startsWith(`${options.namespace}/`)
    );
  }
  if (options.query) {
    repositories = repositories.filter(name =>
      name.toLowerCase().includes(options.query!.toLowerCase())
    );
  }
  if (options.offset) repositories = repositories.slice(options.offset);
  if (options.limit) repositories = repositories.slice(0, options.limit);

  return repositories.map(name => {
    const { namespace, imageName } = this.parseImageName(name);
    return { namespace, name: imageName, fullName: name };
  });
}
```

### Custom REST API (GAR, GitLab, Gitea)

Some registries do not support `_catalog` or provide richer metadata through their own API. In these cases, use the registry-specific REST endpoint.

**GAR example** -- uses the Artifact Registry REST API:

```typescript
async listImages(options: ListImagesOptions = {}): Promise<RegistryImage[]> {
  const parent = `projects/${projectId}/locations/${location}/repositories/${repo}`;
  const url = `https://artifactregistry.googleapis.com/v1/${parent}/dockerImages`;

  const response = await this.makeAuthenticatedRequest(url);
  const data = await response.json();

  return (data.dockerImages || []).map(img => {
    const imageName = img.name.split('/dockerImages/')[1].split('@')[0];
    return { namespace: null, name: imageName, fullName: imageName };
  });
}
```

**GitLab example** -- uses the GitLab Container Registry API:

```typescript
async listImages(): Promise<RegistryImage[]> {
  const url = `${gitlabUrl}/api/v4/projects/${projectId}/registry/repositories`;
  const response = await fetch(url, {
    headers: { 'PRIVATE-TOKEN': this.config.token }
  });
  const repos = await response.json();
  return repos.map(repo => ({
    namespace: null,
    name: repo.name,
    fullName: repo.path
  }));
}
```

## Required Methods

Every provider must implement these abstract methods from `EnhancedRegistryProvider`:

| Method | Signature | Purpose |
|--------|-----------|---------|
| `getProviderName` | `(): string` | Human-readable name (e.g. "Amazon ECR") |
| `getSupportedCapabilities` | `(): RegistryCapability[]` | List of features: `LIST_IMAGES`, `GET_TAGS`, `GET_METADATA`, `SEARCH`, `DELETE_IMAGES`, `VULNERABILITY_SCAN`, `PUSH_IMAGES`, `CLEANUP_POLICIES` |
| `getRateLimits` | `(): RateLimit` | Rate limit configuration with `requestsPerHour`, `requestsPerMinute`, `burstLimit` |
| `parseConfig` | `(repository: Repository): RegistryConfig` | Extract provider-specific config from the `Repository` record |
| `validateConfiguration` | `(): { valid: boolean; errors: string[] }` | Validate that required fields are present and correctly formatted |
| `getAuthHeaders` | `(): Promise<Record<string, string>>` | Return HTTP headers for authenticated API calls |
| `getSkopeoAuthArgs` | `(): Promise<string>` | Return credential arguments for skopeo commands (e.g. `--creds "user:pass"`) |
| `testConnection` | `(): Promise<ConnectionTestResult>` | Verify credentials and registry reachability |
| `formatFullImageReference` | `(image: string, tag: string): string` | Build fully qualified image ref (e.g. `registry.example.com/ns/image:tag`) |
| `listImages` | `(options?: ListImagesOptions): Promise<RegistryImage[]>` | List available images, with optional filtering/pagination |
| `getImageMetadata` | `(namespace: string \| null, imageName: string): Promise<ImageMetadata>` | Get metadata for a specific image including tags |
| `getTags` | `(namespace: string \| null, imageName: string): Promise<ImageTag[]>` | List tags for a specific image |

Optional methods with default implementations (override if your registry supports them):

| Method | Default Behavior |
|--------|-----------------|
| `searchImages(query, options?)` | Throws "not supported" |
| `deleteImage(image, tag)` | Throws "not supported" |
| `getVulnerabilities(image, tag)` | Returns empty array |
| `refreshAuth()` | No-op (override for token refresh) |

Also add a static method:

```typescript
static canHandle(repository: Repository): boolean {
  return repository.type === 'MY_TYPE' ||
    (repository.registryUrl?.includes('myregistry.example.com') ?? false);
}
```

## Testing Checklist

Before submitting a new provider, verify:

- [ ] `testConnection()` succeeds with valid credentials
- [ ] `testConnection()` returns a clear error with invalid credentials
- [ ] `listImages()` returns correct image names
- [ ] `getTags()` returns tags for a known image
- [ ] `getImageMetadata()` returns metadata with tags populated
- [ ] `inspectImage()` returns size, digest, and platform info (inherited from base class)
- [ ] `pullImage()` downloads an image tar successfully (inherited from base class)
- [ ] `validateConfiguration()` catches missing required fields
- [ ] `validateConfiguration()` passes with a complete config
- [ ] `formatFullImageReference()` produces a valid reference that skopeo can use
- [ ] `canHandle()` returns true for matching repositories and false otherwise
- [ ] Rate limiting does not cause test failures (increase limits if needed)
- [ ] TLS verification works for both HTTPS and HTTP registries

## Registration

After implementing the provider, register it so HarborGuard can use it.

### 1. Add RepositoryType enum value (if needed)

In `prisma/schema.prisma`, add your type to the `RepositoryType` enum:

```prisma
enum RepositoryType {
  DOCKERHUB
  GHCR
  GITLAB
  GENERIC
  NEXUS
  ACR
  GCR
  MY_NEW_TYPE  // <-- add here
}
```

Run the migration:

```bash
npx prisma migrate dev --name add-my-new-type
```

### 2. Register in the factory

In `src/lib/registry/providers/RegistryProviderFactory.ts`:

```typescript
import { MyNewProvider } from './my_new/MyNewProvider';

// In the static block:
static {
  this.register('DOCKERHUB', DockerHubProvider);
  // ... existing providers ...
  this.register('MY_NEW_TYPE', MyNewProvider);  // <-- add here
}

// In createFromRepository():
if (MyNewProvider.canHandle(repository)) {
  return new MyNewProvider(repository);
}
```

Place your `canHandle` check **before** `GenericOCIProvider` since that is the fallback.

### 3. Add config type

In `src/lib/registry/types.ts`, add your config interface:

```typescript
export interface MyNewConfig extends RegistryConfig {
  username: string;
  password: string;
  projectId: string;
  // ... provider-specific fields
}
```

### 4. Add UI form

Create a form component in `src/components/repository-config/` that renders the fields needed to configure your registry. The form should match the fields expected by your `parseConfig()` method.
