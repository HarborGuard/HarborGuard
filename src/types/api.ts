// API request/response types

import type { ScanStatus, ScanResultStatus, Severity, VulnerabilityStatus } from './prisma';
import type { ScannerConfig } from './scanner';

// Scan Source Types
export type ScanSource = 'registry' | 'local' | 'tar';

export interface ScanRequest {
  image: string;
  tag: string;
  registry?: string;
  source?: ScanSource; // 'registry', 'local', or 'tar'
  dockerImageId?: string; // For local Docker images
  repositoryId?: string; // For private repositories
  scanners?: ScannerConfig; // Optional scanner configuration
  tarPath?: string; // Path to tar file for direct tar scanning
  registryType?: 'DOCKERHUB' | 'GHCR' | 'GENERIC' | 'ECR' | 'GCR' | 'GITLAB'; // Hint for registry type
}

export interface CreateScanRequest extends ScanRequest {
  templateId?: string;
}

export interface CreateImageRequest {
  name: string;
  tag: string;
  registry?: string;
  source?: 'REGISTRY' | 'LOCAL_DOCKER' | 'FILE_UPLOAD' | 'REGISTRY_PRIVATE';
  digest: string;
  platform?: string;
  sizeBytes?: number;
}

export interface CreateVulnerabilityRequest {
  cveId: string;
  title?: string;
  description?: string;
  severity: Severity;
  cvssScore?: number;
  source?: string;
  publishedAt?: string;
  modifiedAt?: string;
}

export interface CreateImageVulnerabilityRequest {
  imageId: string;
  vulnerabilityId: string;
  packageName: string;
  installedVersion?: string;
  fixedVersion?: string;
  status?: VulnerabilityStatus;
}

export interface ScanJob {
  requestId: string;
  scanId: string;
  imageId: string;
  imageName?: string;
  status: ScanStatus;
  progress?: number;
  step?: string;
  error?: string;
}

// Upload types (for backward compatibility with existing upload endpoint)
export interface ScanUploadRequest {
  requestId: string;
  image: {
    name: string;
    tag: string;
    registry?: string;
    digest: string;
    platform?: string;
    sizeBytes?: number;
  };
  scan: {
    startedAt: string;
    finishedAt?: string;
    status: ScanStatus;
    reportsDir?: string;
    errorMessage?: string;
    riskScore?: number;
  };
  scanResults?: Array<{
    scannerId: string;
    rawOutput?: any;
    status?: ScanResultStatus;
    errorMessage?: string;
  }>;
}
