import { config } from '@/lib/config';
import { logger } from '@/lib/logger';
import type { ScanRequest } from '@/types';

export interface QueuedScan {
  requestId: string;
  scanId: string;
  imageId: string;
  request: ScanRequest;
  status: 'queued' | 'running' | 'completed' | 'failed';
  queuedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  priority?: number;
}

interface QueueStats {
  queued: number;
  running: number;
  completed: number;
  failed: number;
  totalProcessed: number;
}

export class ScanQueue {
  private queue: QueuedScan[] = [];
  private running: Map<string, QueuedScan> = new Map();
  private completed: Map<string, QueuedScan> = new Map();
  private processingQueue = false;
  private eventListeners: Map<string, Set<(scan: QueuedScan) => void>> = new Map();

  constructor() {
    logger.info(`[ScanQueue] Initialized with max concurrent scans: ${config.maxConcurrentScans}`);
  }

  /**
   * Add a scan to the queue
   */
  async addToQueue(scan: Omit<QueuedScan, 'status' | 'queuedAt'>): Promise<void> {
    const queuedScan: QueuedScan = {
      ...scan,
      status: 'queued',
      queuedAt: new Date(),
      priority: scan.priority || 0
    };

    // Sort by priority (higher first) then by queue time (older first)
    this.queue.push(queuedScan);
    this.queue.sort((a, b) => {
      if (a.priority !== b.priority) {
        return (b.priority || 0) - (a.priority || 0);
      }
      return a.queuedAt.getTime() - b.queuedAt.getTime();
    });

    logger.debug(`[ScanQueue] Added scan ${scan.requestId} to queue. Queue length: ${this.queue.length}`);
    this.emit('scan-queued', queuedScan);

    // Try to process the queue
    await this.processQueue();
  }

  /**
   * Process the queue and start scans if slots are available
   */
  async processQueue(): Promise<void> {
    if (this.processingQueue) {
      return;
    }

    this.processingQueue = true;

    try {
      while (this.queue.length > 0 && this.running.size < config.maxConcurrentScans) {
        const scan = this.queue.shift();
        if (!scan) break;

        scan.status = 'running';
        scan.startedAt = new Date();
        this.running.set(scan.requestId, scan);

        logger.info(`[ScanQueue] Starting scan ${scan.requestId}. Running: ${this.running.size}/${config.maxConcurrentScans}, Queued: ${this.queue.length}`);
        
        this.emit('scan-started', scan);
      }

      if (this.queue.length > 0) {
        logger.debug(`[ScanQueue] ${this.queue.length} scans still queued, waiting for slots`);
      }
    } finally {
      this.processingQueue = false;
    }
  }

  /**
   * Mark a scan as completed and process the next in queue
   */
  async completeScan(requestId: string, error?: string): Promise<void> {
    const scan = this.running.get(requestId);
    if (!scan) {
      logger.warn(`[ScanQueue] Attempted to complete unknown scan: ${requestId}`);
      return;
    }

    scan.status = error ? 'failed' : 'completed';
    scan.completedAt = new Date();
    if (error) {
      scan.error = error;
    }

    this.running.delete(requestId);
    this.completed.set(requestId, scan);

    logger.info(`[ScanQueue] Scan ${requestId} ${scan.status}. Running: ${this.running.size}/${config.maxConcurrentScans}, Queued: ${this.queue.length}`);
    
    this.emit('scan-completed', scan);

    // Clean up old completed scans (keep last 100)
    if (this.completed.size > 100) {
      const toDelete = Array.from(this.completed.keys()).slice(0, this.completed.size - 100);
      toDelete.forEach(id => this.completed.delete(id));
    }

    // Process next scan in queue
    await this.processQueue();
  }

  /**
   * Get the next scan to be executed (for ScannerService)
   */
  getNextScan(): QueuedScan | null {
    const runningScans = Array.from(this.running.values());
    const nextScan = runningScans.find(scan => scan.status === 'running' && !scan.startedAt);
    return nextScan || null;
  }

  /**
   * Check if we can start a new scan immediately
   */
  canStartImmediately(): boolean {
    return this.running.size < config.maxConcurrentScans;
  }

  /**
   * Get queue statistics
   */
  getStats(): QueueStats {
    return {
      queued: this.queue.length,
      running: this.running.size,
      completed: this.completed.size,
      failed: Array.from(this.completed.values()).filter(s => s.status === 'failed').length,
      totalProcessed: this.completed.size
    };
  }

  /**
   * Get queue position for a specific scan
   */
  getQueuePosition(requestId: string): number {
    const index = this.queue.findIndex(scan => scan.requestId === requestId);
    return index === -1 ? -1 : index + 1;
  }

  /**
   * Get all queued scans
   */
  getQueuedScans(): QueuedScan[] {
    return [...this.queue];
  }

  /**
   * Get all running scans
   */
  getRunningScans(): QueuedScan[] {
    return Array.from(this.running.values());
  }

  /**
   * Cancel a queued scan
   */
  cancelQueuedScan(requestId: string): boolean {
    const index = this.queue.findIndex(scan => scan.requestId === requestId);
    if (index !== -1) {
      const [removedScan] = this.queue.splice(index, 1);
      logger.info(`[ScanQueue] Cancelled queued scan ${requestId}`);
      this.emit('scan-cancelled', removedScan);
      return true;
    }
    return false;
  }

  /**
   * Clear the entire queue (emergency stop)
   */
  clearQueue(): number {
    const count = this.queue.length;
    this.queue = [];
    logger.warn(`[ScanQueue] Cleared ${count} queued scans`);
    return count;
  }

  /**
   * Event emitter functionality
   */
  private emit(event: string, scan: QueuedScan): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(scan);
        } catch (error) {
          logger.error(`[ScanQueue] Error in event listener for ${event}:`, error);
        }
      });
    }
  }

  on(event: 'scan-queued' | 'scan-started' | 'scan-completed' | 'scan-cancelled', listener: (scan: QueuedScan) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(listener);
  }

  off(event: string, listener: (scan: QueuedScan) => void): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(listener);
    }
  }

  /**
   * Get estimated wait time for a queued scan
   */
  getEstimatedWaitTime(requestId: string): number | null {
    const position = this.getQueuePosition(requestId);
    if (position === -1) return null;

    // Estimate based on average scan time (30 seconds per scan as a rough estimate)
    const averageScanTime = 30000; // 30 seconds in ms
    const slotsNeeded = Math.ceil(position / config.maxConcurrentScans);
    return slotsNeeded * averageScanTime;
  }
}

// Global singleton for the scan queue
declare global {
  var __harborguard_scan_queue: ScanQueue | undefined;
}

function getScanQueue(): ScanQueue {
  if (!globalThis.__harborguard_scan_queue) {
    globalThis.__harborguard_scan_queue = new ScanQueue();
  }
  return globalThis.__harborguard_scan_queue;
}

export const scanQueue = getScanQueue();