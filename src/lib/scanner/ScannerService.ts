import { ScanProgressEvent } from './types';
import { ProgressTracker } from './ProgressTracker';
import { DatabaseAdapter } from './DatabaseAdapter';
import { scanQueue } from './ScanQueue';
import { detectScanMode, executeScanViaSensor, dispatchScanToAgent, ingestEnvelope } from './SensorBridge';
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

// Store the listener function globally so we can remove it later
declare global {
  var __harborguard_scan_listener: ((queuedScan: any) => void) | undefined;
}

export class ScannerService {
  private progressTracker: ProgressTracker;
  private databaseAdapter: DatabaseAdapter;
  private instanceId: string;
  private scanStartedListener?: (queuedScan: any) => void;

  constructor() {
    this.instanceId = Math.random().toString(36).substring(2, 8);
    this.progressTracker = new ProgressTracker(globalJobs, this.updateJobStatus.bind(this));
    this.databaseAdapter = new DatabaseAdapter();

    // Set up queue event listeners
    this.setupQueueListeners();

    if (process.env.NODE_ENV !== 'test') {
      console.log(`[ScannerService] Created new instance ${this.instanceId}`);
    }
  }

  static getInstance(): ScannerService {
    if (!globalThis.__harborguard_scanner_service) {
      globalThis.__harborguard_scanner_service = new ScannerService();
    }
    return globalThis.__harborguard_scanner_service;
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
    // Remove any existing global listener first
    if (globalThis.__harborguard_scan_listener) {
      scanQueue.off('scan-started', globalThis.__harborguard_scan_listener);
      logger.debug(`[ScannerService] Removed existing scan-started listener`);
    }

    // Create new listener
    this.scanStartedListener = async (queuedScan) => {
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
    };

    // Store globally and add as listener
    globalThis.__harborguard_scan_listener = this.scanStartedListener;
    scanQueue.on('scan-started', this.scanStartedListener);
  }

  private generateRequestId(): string {
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
    const randomHex = Math.random().toString(16).slice(2, 10);
    return `${timestamp}-${randomHex}`;
  }

  private async executeScan(requestId: string, request: ScanRequest, scanId: string, imageId: string) {
    try {
      const mode = await detectScanMode();
      logger.info(`[ScannerService] Scan mode: ${mode} for ${requestId}`);

      if (mode === 'agent-dispatch') {
        // Distributed mode: create an AgentJob and return — the sensor will upload results
        this.updateJobStatus(requestId, 'RUNNING', 10, undefined, 'Dispatching to sensor agent');
        const { jobId } = await dispatchScanToAgent(scanId, request);
        logger.info(`[ScannerService] Scan ${requestId} dispatched as agent job ${jobId}`);
        this.updateJobStatus(requestId, 'RUNNING', 20, undefined, 'Waiting for sensor agent');
        // Release the queue slot — the scan will be completed when the sensor uploads results
        await scanQueue.completeScan(requestId);
        return;
      }

      if (mode === 'local-sensor') {
        // Monolith mode: run sensor CLI locally
        const envelope = await executeScanViaSensor(
          scanId,
          request,
          (pct, step) => this.updateJobStatus(requestId, 'RUNNING', pct, undefined, step),
        );

        this.updateJobStatus(requestId, 'RUNNING', 90, undefined, 'Storing results');
        await ingestEnvelope(scanId, envelope);

        // Send notifications
        const { critical, high } = envelope.aggregates.vulnerabilityCounts;
        if (critical > 0 || high > 0) {
          await notificationService.notifyScanComplete(
            `${request.image}:${request.tag}`,
            scanId,
            envelope.aggregates.vulnerabilityCounts,
          );
        }

        this.updateJobStatus(requestId, 'SUCCESS', 100, undefined, 'Scan completed successfully');
        await scanQueue.completeScan(requestId);
        return;
      }

      // No scanner available — fail with a clear message
      const errorMessage = 'No scan execution path available. Register a sensor agent or deploy the monolith image with the sensor module.';
      logger.error(`[ScannerService] ${errorMessage}`);
      await this.databaseAdapter.updateScanRecord(scanId, {
        status: 'FAILED',
        errorMessage,
        finishedAt: new Date(),
      });
      this.updateJobStatus(requestId, 'FAILED', undefined, errorMessage);
      await scanQueue.completeScan(requestId, errorMessage);
      return;
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

}

// Create singleton scanner service
export const scannerService = ScannerService.getInstance();