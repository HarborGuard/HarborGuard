/**
 * Database cleanup utilities for Harbor Guard
 * Handles automatic cleanup of old scans based on CLEANUP_OLD_SCANS_DAYS configuration
 */

import { config } from './config';
import { logger } from './logger';
import { prisma } from './prisma';
import fs from 'fs/promises';
import path from 'path';

export class DatabaseCleanup {
  private workDir = process.env.SCANNER_WORKDIR || '/workspace';

  /**
   * Clean up old scans and their associated data
   */
  async cleanupOldScans(): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - config.cleanupOldScansDays);

      logger.info(`Starting cleanup of scans older than ${config.cleanupOldScansDays} days (before ${cutoffDate.toISOString()})`);

      let cleanupCount = 0;
      let errorCount = 0;
      const MAX_ITERATIONS = 1000; // Safety guard against infinite loops

      // Process in batches of 100 to prevent memory exhaustion
      for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
        const batch = await prisma.scan.findMany({
          where: {
            createdAt: {
              lt: cutoffDate
            }
          },
          take: 100,
          select: {
            id: true,
            requestId: true,
            reportsDir: true,
          }
        });

        if (batch.length === 0) break;

        // Clean up report directories for this batch
        for (const scan of batch) {
          try {
            if (scan.reportsDir) {
              await this.cleanupReportDirectory(scan.reportsDir);
            } else {
              const defaultReportDir = path.join(this.workDir, 'reports', scan.requestId);
              await this.cleanupReportDirectory(defaultReportDir);
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error(`Failed to cleanup report files for scan ${scan.id}:`, errorMessage);
          }
        }

        // Batch delete scans from database (cascade handles related records)
        try {
          await prisma.scan.deleteMany({
            where: {
              id: { in: batch.map(s => s.id) }
            }
          });
          cleanupCount += batch.length;
        } catch (error) {
          errorCount += batch.length;
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error(`Failed to delete batch of ${batch.length} scans:`, errorMessage);
          // Break on delete failure to prevent infinite loop retrying the same batch
          break;
        }
      }

      // Clean up orphaned bulk scan items
      await this.cleanupOrphanedBulkScanItems(cutoffDate);

      // Clean up orphaned audit logs
      await this.cleanupOldAuditLogs(cutoffDate);

      logger.info(`Cleanup completed: ${cleanupCount} scans cleaned, ${errorCount} errors`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to perform database cleanup:', errorMessage);
      throw error;
    }
  }

  /**
   * Clean up report directory and files
   */
  private async cleanupReportDirectory(reportDir: string): Promise<void> {
    try {
      await fs.access(reportDir);
      await fs.rm(reportDir, { recursive: true, force: true });
      logger.debug(`Cleaned up report directory: ${reportDir}`);
    } catch (error) {
      // Directory might not exist, which is fine
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.warn(`Failed to cleanup report directory ${reportDir}:`, error);
      }
    }
  }

  /**
   * Clean up orphaned bulk scan items
   */
  private async cleanupOrphanedBulkScanItems(cutoffDate: Date): Promise<void> {
    try {
      let totalCleaned = 0;

      // Process in batches of 100 to prevent memory exhaustion
      while (true) {
        const batch = await prisma.bulkScanBatch.findMany({
          where: {
            createdAt: {
              lt: cutoffDate
            }
          },
          take: 100,
          select: { id: true }
        });

        if (batch.length === 0) break;

        await prisma.bulkScanBatch.deleteMany({
          where: {
            id: { in: batch.map(b => b.id) }
          }
        });

        totalCleaned += batch.length;
      }

      if (totalCleaned > 0) {
        logger.debug(`Cleaned up ${totalCleaned} old bulk scan batches`);
      }
    } catch (error) {
      logger.warn('Failed to cleanup orphaned bulk scan items:', error);
    }
  }

  /**
   * Clean up old audit logs
   */
  private async cleanupOldAuditLogs(cutoffDate: Date): Promise<void> {
    try {
      const result = await prisma.auditLog.deleteMany({
        where: {
          timestamp: {
            lt: cutoffDate
          }
        }
      });

      if (result.count > 0) {
        logger.debug(`Cleaned up ${result.count} old audit log entries`);
      }
    } catch (error) {
      logger.warn('Failed to cleanup old audit logs:', error);
    }
  }

  /**
   * Get cleanup statistics
   */
  async getCleanupStats(): Promise<{
    totalScans: number;
    oldScans: number;
    cleanupThresholdDays: number;
    estimatedCleanupDate: Date;
  }> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - config.cleanupOldScansDays);

    const [totalScans, oldScans] = await Promise.all([
      prisma.scan.count(),
      prisma.scan.count({
        where: {
          createdAt: {
            lt: cutoffDate
          }
        }
      })
    ]);

    return {
      totalScans,
      oldScans,
      cleanupThresholdDays: config.cleanupOldScansDays,
      estimatedCleanupDate: cutoffDate
    };
  }
}

// Create singleton instance
export const databaseCleanup = new DatabaseCleanup();