// Legacy types for compatibility (to be phased out)

import type {
  DockleReport,
  TrivyReport,
  GrypeReport,
  SyftReport,
  OSVReport,
  DiveReport,
  ImageMetadata
} from './scanner';

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
