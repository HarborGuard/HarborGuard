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

export interface VulnerabilityCount {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

export interface ComplianceScore {
  dockle: {
    score: number;
    grade: string;
    fatal: number;
    warn: number;
    info: number;
    pass: number;
  };
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