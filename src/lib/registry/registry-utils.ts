/**
 * Registry utilities for detecting and normalizing registry information
 */

export type RegistryType = 'DOCKERHUB' | 'GHCR' | 'ECR' | 'GCR' | 'GITLAB' | 'GENERIC';

export interface RegistryInfo {
  url: string;
  type: RegistryType;
  displayName: string;
}

/**
 * Registry configurations with their detection patterns and normalized values
 */
const REGISTRY_CONFIGS: Record<RegistryType, {
  urls: string[];
  displayNames: string[];
  patterns: RegExp[];
  normalizedUrl: string;
  displayName: string;
}> = {
  DOCKERHUB: {
    urls: ['docker.io', 'registry-1.docker.io', 'index.docker.io', 'registry.hub.docker.com'],
    displayNames: ['Docker Hub', 'Docker Hub Public', 'DockerHub'],
    patterns: [/^docker\.io/, /docker\.hub/, /registry-1\.docker\.io/],
    normalizedUrl: 'docker.io',
    displayName: 'Docker Hub'
  },
  GHCR: {
    urls: ['ghcr.io'],
    displayNames: ['GHCR Public', 'GitHub Container Registry', 'GitHub Registry'],
    patterns: [/ghcr\.io/],
    normalizedUrl: 'ghcr.io',
    displayName: 'GHCR Public'
  },
  ECR: {
    urls: [],
    displayNames: ['ECR', 'AWS ECR', 'Amazon ECR'],
    patterns: [/\.dkr\.ecr\.[^.]+\.amazonaws\.com/, /public\.ecr\.aws/],
    normalizedUrl: '',
    displayName: 'Amazon ECR'
  },
  GCR: {
    urls: ['gcr.io', 'us.gcr.io', 'eu.gcr.io', 'asia.gcr.io'],
    displayNames: ['GCR', 'Google Container Registry'],
    patterns: [/gcr\.io/, /pkg\.dev/],
    normalizedUrl: 'gcr.io',
    displayName: 'Google Container Registry'
  },
  GITLAB: {
    urls: ['registry.gitlab.com'],
    displayNames: ['GitLab', 'GitLab Registry'],
    patterns: [/registry\.gitlab\.com/],
    normalizedUrl: 'registry.gitlab.com',
    displayName: 'GitLab Registry'
  },
  GENERIC: {
    urls: [],
    displayNames: ['Generic Registry', 'Private Registry'],
    patterns: [],
    normalizedUrl: '',
    displayName: 'Generic Registry'
  }
};

/**
 * Detect registry type from a URL or display name
 */
export function detectRegistryType(input: string | undefined): RegistryType {
  if (!input) return 'DOCKERHUB'; // Default to Docker Hub
  
  const normalizedInput = input.toLowerCase().trim();
  
  // Check each registry type
  for (const [type, config] of Object.entries(REGISTRY_CONFIGS)) {
    // Check URLs
    if (config.urls.some(url => normalizedInput === url || normalizedInput.includes(url))) {
      return type as RegistryType;
    }
    
    // Check display names
    if (config.displayNames.some(name => normalizedInput === name.toLowerCase())) {
      return type as RegistryType;
    }
    
    // Check patterns
    if (config.patterns.some(pattern => pattern.test(normalizedInput))) {
      return type as RegistryType;
    }
  }
  
  // If it contains a dot or colon (likely a registry URL), return GENERIC
  if (normalizedInput.includes('.') || normalizedInput.includes(':')) {
    return 'GENERIC';
  }
  
  // Default to Docker Hub for simple image names
  return 'DOCKERHUB';
}

/**
 * Get normalized registry URL from input (URL or display name)
 */
export function normalizeRegistryUrl(input: string | undefined, type?: RegistryType): string {
  if (!input) {
    return type ? REGISTRY_CONFIGS[type].normalizedUrl : 'docker.io';
  }
  
  const detectedType = type || detectRegistryType(input);
  const config = REGISTRY_CONFIGS[detectedType];
  
  // If we have a normalized URL for this type, use it
  if (config.normalizedUrl) {
    return config.normalizedUrl;
  }
  
  // For ECR and other dynamic registries, return the input if it's a valid URL
  if (detectedType === 'ECR' || detectedType === 'GENERIC') {
    // Remove any display name artifacts and return clean URL
    const cleanInput = input.trim();
    if (cleanInput.includes('.') || cleanInput.includes(':')) {
      return cleanInput;
    }
  }
  
  // Default to docker.io
  return 'docker.io';
}

/**
 * Get display name for a registry
 */
export function getRegistryDisplayName(input: string | undefined, type?: RegistryType): string {
  const detectedType = type || detectRegistryType(input);
  return REGISTRY_CONFIGS[detectedType].displayName;
}

/**
 * Parse image string and extract registry information
 */
export function parseImageString(imageString: string): {
  imageName: string;
  tag: string;
  registry?: string;
  registryType?: RegistryType;
} {
  let fullImage = imageString.trim();
  let registry: string | undefined;
  let registryType: RegistryType | undefined;
  let imageName: string;
  let tag = 'latest';
  
  // Check if it has a registry (contains domain/port)
  if (fullImage.includes('/')) {
    const parts = fullImage.split('/');
    // Check if first part looks like a registry (contains dot or colon)
    if (parts[0].includes('.') || parts[0].includes(':')) {
      registry = parts[0];
      fullImage = parts.slice(1).join('/');
      registryType = detectRegistryType(registry);
    }
  }
  
  // Split image name and tag
  if (fullImage.includes(':')) {
    const lastColonIndex = fullImage.lastIndexOf(':');
    imageName = fullImage.substring(0, lastColonIndex);
    tag = fullImage.substring(lastColonIndex + 1);
  } else {
    imageName = fullImage;
  }
  
  return { imageName, tag, registry, registryType };
}

/**
 * Build scan request with proper registry information
 */
export function buildScanRequest(
  imageString: string,
  source: string,
  additionalParams?: Record<string, any>
): Record<string, any> {
  const parsed = parseImageString(imageString);
  
  const request: Record<string, any> = {
    image: parsed.imageName,
    tag: parsed.tag,
    ...additionalParams
  };
  
  // Handle source-specific registry assignment
  switch (source) {
    case 'github':
      request.registryType = 'GHCR';
      request.registry = 'ghcr.io';
      break;
    case 'dockerhub':
      request.registryType = 'DOCKERHUB';
      request.registry = 'docker.io';
      break;
    case 'local':
      request.source = 'local';
      break;
    default:
      if (parsed.registry) {
        request.registry = normalizeRegistryUrl(parsed.registry, parsed.registryType);
        request.registryType = parsed.registryType;
      }
  }
  
  return request;
}

/**
 * Build rescan request from existing scan data
 */
export function buildRescanRequest(
  imageName: string,
  tag: string,
  registry: string | undefined,
  source: string
): Record<string, any> {
  const request: Record<string, any> = {
    image: imageName,
    tag: tag || 'latest',
    source: source || 'registry'
  };
  
  if (registry) {
    const registryType = detectRegistryType(registry);
    request.registry = normalizeRegistryUrl(registry, registryType);
    request.registryType = registryType;
  }
  
  return request;
}