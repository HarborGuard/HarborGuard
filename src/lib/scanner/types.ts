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

export interface IDatabaseAdapter {
  initializeScanRecord(requestId: string, request: any): Promise<{ scanId: string; imageId: string }>;
  updateScanRecord(scanId: string, updates: any): Promise<void>;
}
