import type { ScanRequest } from '@/types';

export interface ScanSchedule {
  id: string;
  name: string;
  cronExpression: string;
  scanRequest: ScanRequest | BulkScanRequest;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastRunAt?: Date;
  nextRunAt?: Date;
  createdBy?: string;
}

export interface ScheduledScanExecution {
  id: string;
  scheduleId: string;
  scanId?: string;
  executionTime: Date;
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  errorMessage?: string;
}

export interface BulkScanRequest {
  type: 'bulk';
  patterns: {
    imagePattern?: string;
    registryPattern?: string;
    tagPattern?: string;
  };
  excludePatterns?: string[];
  maxConcurrent?: number;
  scanTemplate?: string;
}

export interface CreateScheduleRequest {
  name: string;
  cronExpression: string;
  scanRequest: ScanRequest | BulkScanRequest;
  createdBy?: string;
}