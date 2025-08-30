import { config } from '@/lib/config';
import type { ScanRequest } from '@/types';

// Mock the config before importing ScanQueue
jest.mock('@/lib/config', () => ({
  config: {
    maxConcurrentScans: 3,
    scanTimeoutMinutes: 30,
    enabledScanners: ['trivy', 'grype']
  }
}));

jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    scanner: jest.fn()
  }
}));

import { ScanQueue } from '../ScanQueue';

describe('ScanQueue', () => {
  let queue: ScanQueue;
  
  beforeEach(() => {
    queue = new ScanQueue();
  });

  describe('Queue Management', () => {
    it('should add scans to queue when max concurrent is reached', async () => {
      const mockRequest: ScanRequest = {
        image: 'test-image',
        tag: 'latest',
        source: 'registry'
      };

      // Add scans up to max concurrent
      for (let i = 0; i < 3; i++) {
        await queue.addToQueue({
          requestId: `scan-${i}`,
          scanId: `scanId-${i}`,
          imageId: `imageId-${i}`,
          request: mockRequest
        });
      }

      // Verify initial state
      let stats = queue.getStats();
      expect(stats.running).toBe(3);
      expect(stats.queued).toBe(0);

      // Add one more scan - should be queued
      await queue.addToQueue({
        requestId: 'scan-3',
        scanId: 'scanId-3',
        imageId: 'imageId-3',
        request: mockRequest
      });

      stats = queue.getStats();
      expect(stats.running).toBe(3);
      expect(stats.queued).toBe(1);
    });

    it('should process queued scans when slot becomes available', async () => {
      const mockRequest: ScanRequest = {
        image: 'test-image',
        tag: 'latest',
        source: 'registry'
      };

      // Fill up concurrent slots
      for (let i = 0; i < 3; i++) {
        await queue.addToQueue({
          requestId: `scan-${i}`,
          scanId: `scanId-${i}`,
          imageId: `imageId-${i}`,
          request: mockRequest
        });
      }

      // Add queued scan
      await queue.addToQueue({
        requestId: 'scan-3',
        scanId: 'scanId-3',
        imageId: 'imageId-3',
        request: mockRequest
      });

      // Complete one scan
      await queue.completeScan('scan-0');

      const stats = queue.getStats();
      expect(stats.running).toBe(3); // Queued scan should have started
      expect(stats.queued).toBe(0);
      expect(stats.completed).toBe(1);
    });

    it('should respect priority when processing queue', async () => {
      const mockRequest: ScanRequest = {
        image: 'test-image',
        tag: 'latest',
        source: 'registry'
      };

      // Fill slots
      for (let i = 0; i < 3; i++) {
        await queue.addToQueue({
          requestId: `scan-${i}`,
          scanId: `scanId-${i}`,
          imageId: `imageId-${i}`,
          request: mockRequest
        });
      }

      // Add low priority scan
      await queue.addToQueue({
        requestId: 'low-priority',
        scanId: 'scanId-low',
        imageId: 'imageId-low',
        request: mockRequest,
        priority: -1
      });

      // Add high priority scan
      await queue.addToQueue({
        requestId: 'high-priority',
        scanId: 'scanId-high',
        imageId: 'imageId-high',
        request: mockRequest,
        priority: 10
      });

      // High priority should be first in queue
      const queuedScans = queue.getQueuedScans();
      expect(queuedScans[0].requestId).toBe('high-priority');
      expect(queuedScans[1].requestId).toBe('low-priority');
    });
  });

  describe('Queue Position and Wait Time', () => {
    it('should return correct queue position', async () => {
      const mockRequest: ScanRequest = {
        image: 'test-image',
        tag: 'latest',
        source: 'registry'
      };

      // Fill slots
      for (let i = 0; i < 3; i++) {
        await queue.addToQueue({
          requestId: `scan-${i}`,
          scanId: `scanId-${i}`,
          imageId: `imageId-${i}`,
          request: mockRequest
        });
      }

      // Add queued scans
      for (let i = 3; i < 6; i++) {
        await queue.addToQueue({
          requestId: `scan-${i}`,
          scanId: `scanId-${i}`,
          imageId: `imageId-${i}`,
          request: mockRequest
        });
      }

      expect(queue.getQueuePosition('scan-3')).toBe(1);
      expect(queue.getQueuePosition('scan-4')).toBe(2);
      expect(queue.getQueuePosition('scan-5')).toBe(3);
      expect(queue.getQueuePosition('scan-0')).toBe(-1); // Running, not queued
    });

    it('should estimate wait time based on queue position', async () => {
      const mockRequest: ScanRequest = {
        image: 'test-image',
        tag: 'latest',
        source: 'registry'
      };

      // Fill slots
      for (let i = 0; i < 3; i++) {
        await queue.addToQueue({
          requestId: `scan-${i}`,
          scanId: `scanId-${i}`,
          imageId: `imageId-${i}`,
          request: mockRequest
        });
      }

      // Add queued scan
      await queue.addToQueue({
        requestId: 'queued-scan',
        scanId: 'scanId-queued',
        imageId: 'imageId-queued',
        request: mockRequest
      });

      const waitTime = queue.getEstimatedWaitTime('queued-scan');
      expect(waitTime).toBeGreaterThan(0);
    });
  });

  describe('Scan Cancellation', () => {
    it('should cancel queued scan', async () => {
      const mockRequest: ScanRequest = {
        image: 'test-image',
        tag: 'latest',
        source: 'registry'
      };

      // Fill slots
      for (let i = 0; i < 3; i++) {
        await queue.addToQueue({
          requestId: `scan-${i}`,
          scanId: `scanId-${i}`,
          imageId: `imageId-${i}`,
          request: mockRequest
        });
      }

      // Add queued scan
      await queue.addToQueue({
        requestId: 'to-cancel',
        scanId: 'scanId-cancel',
        imageId: 'imageId-cancel',
        request: mockRequest
      });

      let stats = queue.getStats();
      expect(stats.queued).toBe(1);

      // Cancel the queued scan
      const cancelled = queue.cancelQueuedScan('to-cancel');
      expect(cancelled).toBe(true);

      stats = queue.getStats();
      expect(stats.queued).toBe(0);
    });

    it('should clear entire queue', async () => {
      const mockRequest: ScanRequest = {
        image: 'test-image',
        tag: 'latest',
        source: 'registry'
      };

      // Fill slots
      for (let i = 0; i < 3; i++) {
        await queue.addToQueue({
          requestId: `scan-${i}`,
          scanId: `scanId-${i}`,
          imageId: `imageId-${i}`,
          request: mockRequest
        });
      }

      // Add multiple queued scans
      for (let i = 3; i < 8; i++) {
        await queue.addToQueue({
          requestId: `scan-${i}`,
          scanId: `scanId-${i}`,
          imageId: `imageId-${i}`,
          request: mockRequest
        });
      }

      let stats = queue.getStats();
      expect(stats.queued).toBe(5);

      // Clear queue
      const clearedCount = queue.clearQueue();
      expect(clearedCount).toBe(5);

      stats = queue.getStats();
      expect(stats.queued).toBe(0);
      expect(stats.running).toBe(3); // Running scans should not be affected
    });
  });

  describe('Event Emitters', () => {
    it('should emit events for queue operations', async () => {
      const mockRequest: ScanRequest = {
        image: 'test-image',
        tag: 'latest',
        source: 'registry'
      };

      const queuedHandler = jest.fn();
      const startedHandler = jest.fn();
      const completedHandler = jest.fn();

      queue.on('scan-queued', queuedHandler);
      queue.on('scan-started', startedHandler);
      queue.on('scan-completed', completedHandler);

      // Add scans
      for (let i = 0; i < 4; i++) {
        await queue.addToQueue({
          requestId: `scan-${i}`,
          scanId: `scanId-${i}`,
          imageId: `imageId-${i}`,
          request: mockRequest
        });
      }

      expect(queuedHandler).toHaveBeenCalledTimes(4);
      expect(startedHandler).toHaveBeenCalledTimes(3); // Only 3 can run

      // Complete a scan
      await queue.completeScan('scan-0');
      expect(completedHandler).toHaveBeenCalledTimes(1);
      expect(startedHandler).toHaveBeenCalledTimes(4); // Queued scan should start
    });
  });
});