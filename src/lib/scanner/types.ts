import type { VulnerabilityCount, ComplianceScore } from '@/types';

export type { VulnerabilityCount, ComplianceScore };

export interface ScanProgressEvent {
  requestId: string;
  scanId: string;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';
  progress: number;
  step?: string;
  error?: string;
  timestamp: string;
}

export interface ScannerVersions {
  [scannerName: string]: string;
}

export interface AggregatedData {
  vulnerabilityCount?: VulnerabilityCount;
  riskScore?: number;
  complianceScore?: ComplianceScore;
}

export interface ScanReports {
  trivy?: any;
  grype?: any;
  syft?: any;
  dockle?: any;
  osv?: any;
  dive?: any;
  metadata?: any;
}

export interface ScannerResult {
  success: boolean;
  data?: any;
  error?: string;
}

export interface IScannerBase {
  readonly name: string;
  scan(tarPath: string, outputPath: string, env: NodeJS.ProcessEnv): Promise<ScannerResult>;
  getVersion(): Promise<string>;
}

export interface IProgressTracker {
  updateProgress(requestId: string, progress: number, step?: string): void;
  simulateDownloadProgress(requestId: string): void;
  simulateScanningProgress(requestId: string): void;
  cleanup(requestId: string): void;
}

export interface IDatabaseAdapter {
  initializeScanRecord(requestId: string, request: any): Promise<{ scanId: string; imageId: string }>;
  updateScanRecord(scanId: string, updates: any): Promise<void>;
  uploadScanResults(scanId: string, reports: ScanReports): Promise<void>;
  calculateAggregatedData(scanId: string, reports: ScanReports): Promise<void>;
}

export interface IMockDataGenerator {
  generateMockScanData(request: any): Promise<ScanReports>;
  uploadMockScanResults(requestId: string, scanId: string, reports: ScanReports): Promise<void>;
}

export interface IScanExecutor {
  executeLocalDockerScan(requestId: string, request: any, scanId: string, imageId: string): Promise<void>;
  executeRegistryScan(requestId: string, request: any, scanId: string, imageId: string): Promise<void>;
  loadScanResults(requestId: string): Promise<ScanReports>;
}

// ---------------------------------------------------------------------------
// Normalized finding types
// ---------------------------------------------------------------------------

export interface NormalizedVulnerability {
  cveId: string;
  source: string;
  severity: string;
  cvssScore?: number;
  title?: string;
  description?: string;
  packageName?: string;
  installedVersion?: string;
  fixedVersion?: string;
  vulnerabilityUrl?: string;
  targetName?: string;
}

export interface NormalizedPackage {
  name: string;
  version: string;
  type: string;
  source: string;
  license?: string;
  purl?: string;
}

export interface NormalizedCompliance {
  checkId: string;
  title: string;
  severity: string;
  source: string;
  category?: string;
  description?: string;
}

export interface NormalizedEfficiency {
  findingType: string;
  title: string;
  severity: string;
  source: string;
  sizeBytes?: number;
  details?: string;
}

// ---------------------------------------------------------------------------
// Scanner adapter interface
// ---------------------------------------------------------------------------

export interface IScannerAdapter {
  readonly name: string;
  saveResults(metadataId: string, report: any): Promise<void>;
  extractVulnerabilities(report: any): NormalizedVulnerability[];
  extractPackages(report: any): NormalizedPackage[];
  extractCompliance(report: any): NormalizedCompliance[];
  extractEfficiency(report: any): NormalizedEfficiency[];
}