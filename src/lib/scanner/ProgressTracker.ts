import { ScanProgressEvent } from './types';
import type { ScanJob } from '@/types';

export class ProgressTracker {
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