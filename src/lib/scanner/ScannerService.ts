import { ScanProgressEvent } from './types';
import { ProgressTracker } from './ProgressTracker';
import { DatabaseAdapter } from './DatabaseAdapter';
import { ScanExecutor } from './ScanExecutor';
import { getScannerVersions } from './scanners';
import type { ScanRequest, ScanJob } from '@/types';
// Template types removed - using basic ScanRequest

export class ScannerService {
  private jobs = new Map<string, ScanJob>();
  private progressTracker: ProgressTracker;
  private databaseAdapter: DatabaseAdapter;
  private scanExecutor: ScanExecutor;

  constructor() {
    this.progressTracker = new ProgressTracker(this.jobs, this.updateJobStatus.bind(this));
    this.databaseAdapter = new DatabaseAdapter();
    this.scanExecutor = new ScanExecutor({
      updateProgress: this.progressTracker.updateProgress.bind(this.progressTracker)
    });
  }

  async startScan(
    request: ScanRequest
  ): Promise<{ requestId: string; scanId: string }> {
    const requestId = this.generateRequestId();
    
    console.log(`Starting scan for ${request.image}:${request.tag} with requestId: ${requestId}`);

    const { scanId, imageId } = await this.databaseAdapter.initializeScanRecord(requestId, request);

    this.jobs.set(requestId, {
      requestId,
      scanId,
      imageId,
      status: 'RUNNING',
      progress: 0
    });

    this.executeScan(requestId, request, scanId, imageId).catch(error => {
      console.error(`Scan ${requestId} failed:`, error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.updateJobStatus(requestId, 'FAILED', undefined, errorMessage);
    });

    return { requestId, scanId };
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
    await this.databaseAdapter.updateScanRecord(scanId, {
      metadata: { scannerVersions } as any,
    });

    await this.databaseAdapter.uploadScanResults(scanId, reports);

    this.updateJobStatus(requestId, 'SUCCESS', 100, undefined, 'Scan completed successfully');
  }

  private isLocalDockerScan(request: ScanRequest): boolean {
    return request.source === 'local';
  }

  private shouldSimulateDownload(request: ScanRequest): boolean {
    return !this.isLocalDockerScan(request);
  }

  private updateJobStatus(requestId: string, status: ScanJob['status'], progress?: number, error?: string, step?: string) {
    const job = this.jobs.get(requestId);
    if (job) {
      job.status = status;
      if (progress !== undefined) job.progress = progress;
      if (error) job.error = error;
      this.jobs.set(requestId, job);

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
    return this.jobs.get(requestId);
  }

  getAllJobs(): ScanJob[] {
    return Array.from(this.jobs.values());
  }

  addProgressListener(listener: (event: ScanProgressEvent) => void) {
    this.progressTracker.addProgressListener(listener);
  }

  removeProgressListener(listener: (event: ScanProgressEvent) => void) {
    this.progressTracker.removeProgressListener(listener);
  }

  async cancelScan(requestId: string): Promise<boolean> {
    const job = this.jobs.get(requestId);
    if (job && job.status === 'RUNNING') {
      this.progressTracker.cleanup(requestId);
      this.updateJobStatus(requestId, 'CANCELLED');
      
      await this.databaseAdapter.updateScanRecord(job.scanId, {
        status: 'CANCELLED',
        finishedAt: new Date()
      });
      
      return true;
    }
    return false;
  }
}

export const scannerService = new ScannerService();