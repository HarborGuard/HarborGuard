import { ScanProgressEvent } from './types';
import { ProgressTracker } from './ProgressTracker';
import { DatabaseAdapter } from './DatabaseAdapter';
import { ScanExecutor } from './ScanExecutor';
import { getScannerVersions } from './scanners';
import { scanQueue } from './ScanQueue';
import type { ScanRequest, ScanJob, ScanStatus } from '@/types';
import { logger } from '@/lib/logger';
import { notificationService } from '@/lib/notifications';
// Template types removed - using basic ScanRequest

// Global shared state to work around Next.js development mode module reloading
declare global {
  var scannerJobs: Map<string, ScanJob> | undefined;
  var __harborguard_scanner_service: ScannerService | undefined;
}

const globalJobs = globalThis.scannerJobs || (globalThis.scannerJobs = new Map<string, ScanJob>());

export class ScannerService {
  private progressTracker: ProgressTracker;
  private databaseAdapter: DatabaseAdapter;
  private scanExecutor: ScanExecutor;
  private instanceId: string;

  constructor() {
    this.instanceId = Math.random().toString(36).substring(2, 8);
    this.progressTracker = new ProgressTracker(globalJobs, this.updateJobStatus.bind(this));
    this.databaseAdapter = new DatabaseAdapter();
    this.scanExecutor = new ScanExecutor({
      updateProgress: this.progressTracker.updateProgress.bind(this.progressTracker)
    });
    
    // Set up queue event listeners
    this.setupQueueListeners();
    
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[ScannerService] Created new instance ${this.instanceId}`);
    }
  }

  async startScan(
    request: ScanRequest,
    priority?: number
  ): Promise<{ requestId: string; scanId: string; queued: boolean; queuePosition?: number }> {
    const requestId = this.generateRequestId();
    
    logger.info(`Requesting scan for ${request.image}:${request.tag} with requestId: ${requestId}`);

    const { scanId, imageId } = await this.databaseAdapter.initializeScanRecord(requestId, request);

    const job: ScanJob = {
      requestId,
      scanId,
      imageId,
      status: 'PENDING' as ScanStatus,
      progress: 0
    };
    globalJobs.set(requestId, job);

    // Add to queue
    await scanQueue.addToQueue({
      requestId,
      scanId,
      imageId,
      request,
      priority
    });

    const queuePosition = scanQueue.getQueuePosition(requestId);
    const queued = queuePosition > 0;

    if (queued) {
      logger.info(`Scan ${requestId} queued at position ${queuePosition}`);
      // Update database to reflect queued status (without queuePosition in metadata)
      await this.databaseAdapter.updateScanRecord(scanId, {
        status: 'PENDING'
      });
    }

    return { requestId, scanId, queued, queuePosition: queued ? queuePosition : undefined };
  }

  private setupQueueListeners(): void {
    // Listen for scan-started events from the queue
    scanQueue.on('scan-started', async (queuedScan) => {
      logger.info(`[ScannerService] Processing queued scan ${queuedScan.requestId}`);
      
      const job = globalJobs.get(queuedScan.requestId);
      if (job) {
        job.status = 'RUNNING';
        globalJobs.set(queuedScan.requestId, job);
      }

      // Execute the scan
      this.executeScan(
        queuedScan.requestId, 
        queuedScan.request, 
        queuedScan.scanId, 
        queuedScan.imageId
      ).catch(error => {
        logger.error(`Scan ${queuedScan.requestId} failed:`, error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.updateJobStatus(queuedScan.requestId, 'FAILED', undefined, errorMessage);
        scanQueue.completeScan(queuedScan.requestId, errorMessage);
      });
    });
  }

  private generateRequestId(): string {
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
    const randomHex = Math.random().toString(16).slice(2, 10);
    return `${timestamp}-${randomHex}`;
  }

  private async executeScan(requestId: string, request: ScanRequest, scanId: string, imageId: string) {
    try {
      if (this.isLocalDockerScan(request)) {
        await this.scanExecutor.executeLocalDockerScan(requestId, request, scanId, imageId);
        await this.finalizeScan(requestId, scanId, request);
      } else {
        if (this.shouldSimulateDownload(request)) {
          this.progressTracker.simulateDownloadProgress(requestId);
        }
        
        this.progressTracker.simulateScanningProgress(requestId);
        
        await this.scanExecutor.executeRegistryScan(requestId, request, scanId, imageId);
        await this.finalizeScan(requestId, scanId, request);
      }
    } catch (error) {
      console.error(`Scan execution failed for ${requestId}:`, error);
      
      this.progressTracker.cleanup(requestId);

      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.databaseAdapter.updateScanRecord(scanId, {
        status: 'FAILED',
        errorMessage,
        finishedAt: new Date()
      });
      this.updateJobStatus(requestId, 'FAILED', undefined, errorMessage);
      throw error;
    }
  }


  private async finalizeScan(requestId: string, scanId: string, _request: ScanRequest) {
    this.updateJobStatus(requestId, 'RUNNING', 90, undefined, 'Processing scan results');

    const reports = await this.scanExecutor.loadScanResults(requestId);
    
    const scannerVersions = await getScannerVersions();
    // Add scanner versions to reports metadata
    if (!reports.metadata) {
      reports.metadata = {};
    }
    reports.metadata.scannerVersions = scannerVersions;

    await this.databaseAdapter.uploadScanResults(scanId, reports);

    // Calculate vulnerability counts for notifications
    const vulnerabilityCounts = this.calculateVulnerabilityCounts(reports);
    
    // Send notifications if high/critical vulnerabilities found
    if (vulnerabilityCounts.critical > 0 || vulnerabilityCounts.high > 0) {
      await notificationService.notifyScanComplete(
        `${_request.image}:${_request.tag}`,
        scanId,
        vulnerabilityCounts
      );
    }

    this.updateJobStatus(requestId, 'SUCCESS', 100, undefined, 'Scan completed successfully');
    
    // Notify queue that scan is complete
    await scanQueue.completeScan(requestId);
  }

  private isLocalDockerScan(request: ScanRequest): boolean {
    return request.source === 'local';
  }

  private shouldSimulateDownload(request: ScanRequest): boolean {
    return !this.isLocalDockerScan(request);
  }

  private updateJobStatus(requestId: string, status: ScanJob['status'], progress?: number, error?: string, step?: string) {
    const job = globalJobs.get(requestId);
    if (job) {
      job.status = status;
      if (progress !== undefined) job.progress = progress;
      if (error) job.error = error;
      globalJobs.set(requestId, job);

      if (status === 'RUNNING' || status === 'SUCCESS' || status === 'FAILED' || status === 'CANCELLED') {
        const progressEvent: ScanProgressEvent = {
          requestId,
          scanId: job.scanId,
          status,
          progress: progress !== undefined ? progress : (job.progress || 0),
          step,
          error,
          timestamp: new Date().toISOString()
        };

        this.progressTracker.emitProgress(progressEvent);
      }
    }
  }

  getScanJob(requestId: string): ScanJob | undefined {
    return globalJobs.get(requestId);
  }

  getAllJobs(): ScanJob[] {
    return globalThis.scannerJobs ? Array.from(globalThis.scannerJobs.values()) : [];
  }

  addProgressListener(listener: (event: ScanProgressEvent) => void) {
    this.progressTracker.addProgressListener(listener);
  }

  removeProgressListener(listener: (event: ScanProgressEvent) => void) {
    this.progressTracker.removeProgressListener(listener);
  }

  async cancelScan(requestId: string): Promise<boolean> {
    // First try to cancel from queue
    if (scanQueue.cancelQueuedScan(requestId)) {
      const job = globalJobs.get(requestId);
      if (job) {
        this.updateJobStatus(requestId, 'CANCELLED');
        await this.databaseAdapter.updateScanRecord(job.scanId, {
          status: 'CANCELLED',
          finishedAt: new Date()
        });
      }
      return true;
    }

    // Otherwise cancel running scan
    const job = globalJobs.get(requestId);
    if (job && job.status === 'RUNNING') {
      this.progressTracker.cleanup(requestId);
      this.updateJobStatus(requestId, 'CANCELLED');
      
      await this.databaseAdapter.updateScanRecord(job.scanId, {
        status: 'CANCELLED',
        finishedAt: new Date()
      });
      
      // Notify queue that scan is complete
      await scanQueue.completeScan(requestId, 'Cancelled by user');
      
      return true;
    }
    return false;
  }

  getQueueStats() {
    return scanQueue.getStats();
  }

  getQueuedScans() {
    return scanQueue.getQueuedScans();
  }

  getRunningScans() {
    return scanQueue.getRunningScans();
  }

  getQueuePosition(requestId: string): number {
    return scanQueue.getQueuePosition(requestId);
  }

  getEstimatedWaitTime(requestId: string): number | null {
    return scanQueue.getEstimatedWaitTime(requestId);
  }

  private calculateVulnerabilityCounts(reports: any): { critical: number; high: number; medium: number; low: number } {
    const counts = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0
    };

    // Count vulnerabilities from all scanner reports
    for (const [scanner, report] of Object.entries(reports)) {
      if (scanner === 'trivy' && report) {
        const trivyReport = report as any;
        if (trivyReport.Results) {
          for (const result of trivyReport.Results) {
            if (result.Vulnerabilities) {
              for (const vuln of result.Vulnerabilities) {
                const severity = (vuln.Severity || 'UNKNOWN').toUpperCase();
                switch (severity) {
                  case 'CRITICAL':
                    counts.critical++;
                    break;
                  case 'HIGH':
                    counts.high++;
                    break;
                  case 'MEDIUM':
                    counts.medium++;
                    break;
                  case 'LOW':
                    counts.low++;
                    break;
                }
              }
            }
          }
        }
      } else if (scanner === 'grype' && report) {
        const grypeReport = report as any;
        if (grypeReport.matches) {
          for (const match of grypeReport.matches) {
            const severity = (match.vulnerability?.severity || 'Unknown').toUpperCase();
            switch (severity) {
              case 'CRITICAL':
                counts.critical++;
                break;
              case 'HIGH':
                counts.high++;
                break;
              case 'MEDIUM':
                counts.medium++;
                break;
              case 'LOW':
                counts.low++;
                break;
            }
          }
        }
      }
    }

    return counts;
  }
}

// Create singleton scanner service
function getScannerService(): ScannerService {
  if (!globalThis.__harborguard_scanner_service) {
    globalThis.__harborguard_scanner_service = new ScannerService();
  }
  return globalThis.__harborguard_scanner_service;
}

export const scannerService = getScannerService();