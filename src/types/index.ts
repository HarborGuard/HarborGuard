// Single source of truth for all application types
// Uses Prisma-generated types as the foundation

import type { 
  Scan as PrismaScan, 
  Image as PrismaImage,
  ScanStatus as PrismaScanStatus,
  CveClassification as PrismaCveClassification
} from '@/generated/prisma';

// Re-export Prisma types as the canonical types
export type ScanStatus = PrismaScanStatus;
export type Image = PrismaImage;
export type CveClassification = PrismaCveClassification;

// Base Scan type from Prisma with proper typing for JSON fields
export type Scan = Omit<PrismaScan, 'sizeBytes'> & {
  // Convert BigInt to string for JSON serialization
  sizeBytes: string | null;
  // Type the JSON fields properly
  scannerReports?: {
    dockle?: DockleReport;
    trivy?: TrivyReport;
    grype?: GrypeReport;
    syft?: SyftReport;
    osv?: OSVReport;
    metadata?: ImageMetadata;
  };
  vulnerabilityCount?: VulnerabilityCount;
  complianceScore?: ComplianceScore;
  scannerVersions?: Record<string, string>;
  scanConfig?: Record<string, any>;
};

// Scan with Image relation included (for API responses)
export type ScanWithImage = Scan & {
  image: Image;
};

// Scanner Report Types
export interface DockleReport {
  summary: {
    fatal: number;
    warn: number;
    info: number;
    skip: number;
    pass: number;
  };
  details: Array<{
    code: string;
    title: string;
    level: "FATAL" | "WARN" | "INFO";
    alerts: string[];
    details: string;
  }>;
}

export interface TrivyReport {
  SchemaVersion: number;
  CreatedAt: string;
  ArtifactName: string;
  ArtifactType: string;
  Metadata: {
    OS: {
      Family: string;
      Name: string;
    };
    ImageID: string;
    DiffIDs: string[];
    ImageConfig: any;
  };
  Results?: Array<{
    Target: string;
    Class: string;
    Type: string;
    Vulnerabilities?: Array<{
      VulnerabilityID: string;
      PkgName: string;
      InstalledVersion: string;
      FixedVersion?: string;
      Severity: string;
      CVSS?: any;
      Description: string;
      Title?: string;
      References: string[];
      references?: string[];
      publishedDate?: string;
    }>;
    Misconfigurations?: Array<{
      Type: string;
      ID: string;
      Title: string;
      Description: string;
      Severity: string;
      Message: string;
    }>;
    Secrets?: Array<{
      RuleID: string;
      Category: string;
      Severity: string;
      Title: string;
      StartLine: number;
      EndLine: number;
      Code: any;
      Match: string;
    }>;
  }>;
}

export interface GrypeReport {
  matches: Array<{
    vulnerability: {
      id: string;
      dataSource: string;
      namespace: string;
      severity: string;
      urls: string[];
      description: string;
      cvss?: Array<{
        version: string;
        vector: string;
        metrics: {
          baseScore: number;
          exploitabilityScore: number;
          impactScore: number;
        };
      }>;
      fix?: {
        versions: string[];
        state: string;
      };
    };
    relatedVulnerabilities: Array<{
      id: string;
      dataSource: string;
      namespace: string;
    }>;
    matchDetails: Array<{
      type: string;
      matcher: string;
      searchedBy: any;
      found: any;
    }>;
    artifact: {
      id: string;
      name: string;
      version: string;
      type: string;
      locations: Array<{
        path: string;
        layerID: string;
      }>;
      language: string;
      licenses: string[];
      cpes: string[];
      purl: string;
      upstreams: Array<{
        name: string;
      }>;
    };
  }>;
  source: {
    type: string;
    target: any;
  };
  distro: {
    name: string;
    version: string;
    idLike: string[];
  };
  descriptor: {
    name: string;
    version: string;
  };
}

export interface SyftReport {
  artifacts: Array<{
    id: string;
    name: string;
    version: string;
    type: string;
    foundBy: string;
    locations: Array<{
      path: string;
      layerID: string;
    }>;
    licenses: string[];
    language: string;
    cpes: string[];
    purl: string;
    upstreams: Array<{
      name: string;
    }>;
  }>;
  artifactRelationships: Array<{
    parent: string;
    child: string;
    type: string;
  }>;
  source: {
    type: string;
    target: any;
  };
  distro: {
    name: string;
    version: string;
    idLike: string[];
  };
  descriptor: {
    name: string;
    version: string;
    configuration: any;
  };
  schema: {
    version: string;
    url: string;
  };
}

export interface OSVReport {
  results: OSVResult[];
  experimental_config?: {
    licenses: {
      summary: boolean;
      allowlist: string[] | null;
    };
  };
}

export interface OSVResult {
  source: {
    path: string;
    type: string;
  };
  packages: OSVPackage[];
}

export interface OSVPackage {
  package: {
    name: string;
    version: string;
    ecosystem: string;
  };
  vulnerabilities: OSVVulnerability[];
  groups?: OSVGroup[];
}

export interface OSVVulnerability {
  id: string;
  modified: string;
  published: string;
  schema_version: string;
  related?: string[];
  details?: string;
  summary?: string;
  severity?: Array<{
    type: string;
    score: string;
  }>;
  affected: Array<{
    package: {
      ecosystem: string;
      name: string;
      purl?: string;
    };
    ranges?: Array<{
      type: string;
      events: Array<{
        introduced?: string;
        fixed?: string;
      }>;
    }>;
    versions?: string[];
    database_specific?: any;
    ecosystem_specific?: any;
  }>;
  references?: Array<{
    type: string;
    url: string;
  }>;
  database_specific?: {
    source: string;
  };
}

export interface OSVGroup {
  ids: string[];
  aliases: string[];
  experimental_analysis?: Record<string, {
    called: boolean;
    unimportant: boolean;
  }>;
  max_severity: string;
}

export interface ImageMetadata {
  Digest: string;
  RepoTags: string[];
  Created: string;
  DockerVersion: string;
  Labels: Record<string, string>;
  Architecture: string;
  Os: string;
  Layers: string[];
  Env: string[];
}

export interface DiveReport {
  layer: DiveLayer[];
}

export interface DiveLayer {
  index: number;
  id: string;
  digestId: string;
  sizeBytes: number;
  command: string;
  fileList: DiveFile[];
}

export interface DiveFile {
  path: string;
  typeFlag: number;
  linkName?: string;
  size: number;
  fileMode: number;
  uid: number;
  gid: number;
  isDir: boolean;
}

// Aggregated Data Types
export interface VulnerabilityCount {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info?: number;
}

export interface ComplianceScore {
  dockle?: {
    score: number;
    grade: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
    fatal: number;
    warn: number;
    info: number;
    pass: number;
  };
}

// Scan Source Types
export type ScanSource = 'registry' | 'local';

export interface DockerImage {
  id: string;
  repository: string;
  tag: string;
  digest: string;
  size: string;
  created: string;
  fullName: string;
}

export interface DockerInfo {
  hasAccess: boolean;
  version?: string;
  error?: string;
}

// API Request/Response Types
export interface ScanRequest {
  image: string;
  tag: string;
  registry?: string;
  source?: ScanSource; // 'registry' or 'local'
  dockerImageId?: string; // For local Docker images
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
    sizeBytes?: number;
    status: ScanStatus;
    reportsDir?: string;
    errorMessage?: string;
    scannerVersions?: Record<string, string>;
    scanConfig?: Record<string, any>;
  };
  reports?: {
    trivy?: any;
    grype?: any;
    syft?: any;
    dockle?: any;
    metadata?: any;
  };
}

// Legacy types for compatibility (to be phased out)
export interface LegacyScan {
  id: number;
  imageId: string; // Add imageId for navigation
  imageName: string; // Add image name for new navigation
  uid: string;
  image: string;
  source?: string; // Add source information
  digestShort: string;
  platform: string;
  sizeMb: number;
  riskScore: number;
  severities: {
    crit: number;
    high: number;
    med: number;
    low: number;
  };
  fixable: {
    count: number;
    percent: number;
  };
  highestCvss?: number;
  misconfigs: number;
  secrets: number;
  osvPackages?: number;
  osvVulnerable?: number;
  osvEcosystems?: string[];
  compliance?: {
    dockle?: "A" | "B" | "C" | "D" | "E" | "F";
  };
  policy?: "Pass" | "Warn" | "Blocked";
  delta?: {
    newCrit?: number;
    resolvedTotal?: number;
  };
  inUse?: {
    clusters: number;
    pods: number;
  };
  baseImage?: string;
  baseUpdate?: string;
  signed?: boolean;
  attested?: boolean;
  sbomFormat?: "spdx" | "cyclonedx";
  dbAge?: string;
  registry?: string;
  project?: string;
  lastScan: string;
  status: "Complete" | "Queued" | "Error" | "Prior";
  header?: string;
  type?: string;
  target?: string;
  limit?: string;
  
  // Raw scanner outputs
  scannerReports?: {
    dockle?: DockleReport;
    trivy?: TrivyReport;
    grype?: GrypeReport;
    syft?: SyftReport;
    osv?: OSVReport;
    dive?: DiveReport;
    metadata?: ImageMetadata;
  };
  
  // Additional scanner-derived fields
  digest?: string;
  layers?: string[];
  osInfo?: {
    family: string;
    name: string;
  };
}