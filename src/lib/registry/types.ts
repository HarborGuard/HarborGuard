import type { Repository, RepositoryType } from '@/generated/prisma';

export interface RegistryImage {
  namespace: string | null;
  name: string;
  fullName: string;
  description?: string;
  isPrivate?: boolean;
  starCount?: number;
  pullCount?: number;
  lastUpdated?: Date;
  availableTags?: ImageTag[];
}

export interface ImageTag {
  name: string;
  size?: number | null;
  created?: Date | undefined;
  lastModified?: Date | undefined;
  lastUpdated?: Date | null; // Deprecated, use created or lastModified
  digest?: string | null;
  platform?: string;
}

export interface ImageMetadata {
  namespace: string | null;
  name: string;
  description?: string;
  isPrivate?: boolean;
  starCount?: number;
  pullCount?: number;
  lastUpdated?: Date;
  tags?: ImageTag[];
  availableTags?: ImageTag[]; // Deprecated, use tags
  vulnerabilities?: Vulnerability[];
}

export interface Vulnerability {
  id: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  title: string;
  description?: string;
  fixedVersion?: string;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  repositoryCount?: number;
  capabilities?: RegistryCapability[];
  error?: Error;
}

export interface ListImagesOptions {
  limit?: number;
  offset?: number;
  namespace?: string;
  query?: string;
}

export interface SearchOptions {
  limit?: number;
  offset?: number;
  includeDescription?: boolean;
}

export type RegistryCapability = 
  | 'LIST_IMAGES' 
  | 'GET_TAGS' 
  | 'SEARCH' 
  | 'GET_METADATA' 
  | 'VULNERABILITY_SCAN'
  | 'VULNERABILITY_SCANNING'
  | 'DELETE_IMAGES'
  | 'PUSH_IMAGES'
  | 'CLEANUP_POLICIES';

export interface RateLimit {
  requestsPerHour: number;
  requestsPerMinute: number;
  burstLimit: number;
  resetTime?: Date;
}

export interface RegistryConfig {
  [key: string]: any;
}

export interface DockerHubConfig extends RegistryConfig {
  username: string;
  password: string;
  organization?: string;
  apiBaseUrl: string;
}

export interface GHCRConfig extends RegistryConfig {
  username: string;
  token: string;
  organization?: string;
  apiBaseUrl: string;
}

export interface GenericOCIConfig extends RegistryConfig {
  username: string;
  password: string;
  registryUrl: string;
  protocol: string;
}

export interface CacheEntry<T = any> {
  data: T;
  cachedAt: Date;
  expiresAt: Date;
}

export interface RepositoryWithConfig extends Repository {
  config?: RegistryConfig;
}