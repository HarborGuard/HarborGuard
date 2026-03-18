// Scanner report interfaces — output schemas for each supported scanner

// Union type for all scanner reports
export type ScannerReport =
  | DockleReport
  | TrivyReport
  | GrypeReport
  | SyftReport
  | OSVReport
  | DiveReport
  | ImageMetadata;

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

// Scanner configuration
export interface ScannerConfig {
  trivy?: boolean;
  grype?: boolean;
  syft?: boolean;
  dockle?: boolean;
  osv?: boolean;
  dive?: boolean;
}

// Scanner availability information
export interface ScannerInfo {
  name: string;
  description: string;
  available: boolean;
}
