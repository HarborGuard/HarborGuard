import { ScanProgressEvent, IProgressTracker } from './types';
import type { ScanJob } from '@/types';

export class ProgressTracker implements IProgressTracker {
  private downloadTimers = new Map<string, NodeJS.Timeout>();
  private scanningTimers = new Map<string, NodeJS.Timeout>();
  private progressListeners = new Set<(event: ScanProgressEvent) => void>();
  
  constructor(
    private jobs: Map<string, ScanJob>,
    private updateJobStatus: (requestId: string, status: ScanJob['status'], progress?: number, error?: string, step?: string) => void
  ) {}

  updateProgress(requestId: string, progress: number, step?: string): void {
    this.updateJobStatus(requestId, 'RUNNING', progress, undefined, step);
  }

  simulateDownloadProgress(requestId: string): void {
    const startTime = Date.now();
    const duration = 55000; // 55 seconds to reach 55%
    const maxProgress = 55; // Max 55% for download phase
    const updateInterval = 3000; // Update every 3 seconds

    const existingTimer = this.downloadTimers.get(requestId);
    if (existingTimer) {
      clearInterval(existingTimer);
    }

    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const job = this.jobs.get(requestId);
      
      if (!job || job.status !== 'RUNNING') {
        clearInterval(timer);
        this.downloadTimers.delete(requestId);
        return;
      }

      const timeProgress = Math.min(elapsed / duration, 1);
      const currentProgress = 1 + (timeProgress * (maxProgress - 1));
      
      if ((job.progress || 0) < 56) {
        let step: string;
        if (currentProgress < 10) {
          step = 'Connecting to registry';
        } else if (currentProgress < 25) {
          step = 'Downloading image layers';
        } else if (currentProgress < 40) {
          step = 'Extracting image data';
        } else if (currentProgress < 55) {
          step = 'Finalizing image download';
        } else {
          step = 'Preparing for scan';
        }

        this.updateJobStatus(requestId, 'RUNNING', Math.floor(currentProgress), undefined, step);
      }

      if (elapsed >= duration || (job.progress || 0) >= 56) {
        clearInterval(timer);
        this.downloadTimers.delete(requestId);
      }
    }, updateInterval);

    this.downloadTimers.set(requestId, timer);
  }

  simulateScanningProgress(requestId: string): void {
    const updateInterval = 3000; // Update every 3 seconds

    const existingTimer = this.scanningTimers.get(requestId);
    if (existingTimer) {
      clearInterval(existingTimer);
    }

    const timer = setInterval(() => {
      const job = this.jobs.get(requestId);
      
      if (!job || job.status !== 'RUNNING') {
        clearInterval(timer);
        this.scanningTimers.delete(requestId);
        return;
      }

      const currentProgress = job.progress || 0;
      
      if (currentProgress >= 55 && currentProgress < 95) {
        const newProgress = currentProgress + 1;
        
        let step: string = job.step || 'Running security scans';
        if (currentProgress < 65) {
          step = 'Running Trivy scan';
        } else if (currentProgress < 75) {
          step = 'Running Grype scan';
        } else if (currentProgress < 85) {
          step = 'Running Syft analysis';
        } else if (currentProgress < 88) {
          step = 'Running OSV scan';
        } else if (currentProgress < 92) {
          step = 'Running Dockle compliance check';
        } else if (currentProgress < 95) {
          step = 'Running Dive layer analysis';
        } else {
          step = 'Finalizing scan results';
        }
        
        this.updateJobStatus(requestId, 'RUNNING', newProgress, undefined, step);
      }

      if (currentProgress >= 95) {
        clearInterval(timer);
        this.scanningTimers.delete(requestId);
      }
    }, updateInterval);

    this.scanningTimers.set(requestId, timer);
  }

  cleanup(requestId: string): void {
    const downloadTimer = this.downloadTimers.get(requestId);
    if (downloadTimer) {
      clearInterval(downloadTimer);
      this.downloadTimers.delete(requestId);
    }
    
    const scanningTimer = this.scanningTimers.get(requestId);
    if (scanningTimer) {
      clearInterval(scanningTimer);
      this.scanningTimers.delete(requestId);
    }
  }

  addProgressListener(listener: (event: ScanProgressEvent) => void): void {
    this.progressListeners.add(listener);
  }

  removeProgressListener(listener: (event: ScanProgressEvent) => void): void {
    this.progressListeners.delete(listener);
  }

  emitProgress(event: ScanProgressEvent): void {
    this.progressListeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('Error in progress listener:', error);
      }
    });
  }
}