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

      // Find old scans to delete
      const oldScans = await prisma.scan.findMany({
        where: {
          createdAt: {
            lt: cutoffDate
          }
        },
        select: {
          id: true,
          requestId: true,
          reportsDir: true,
          createdAt: true
        }
      });

      if (oldScans.length === 0) {
        logger.info('No old scans found for cleanup');
        return;
      }

      logger.info(`Found ${oldScans.length} old scans to clean up`);

      let cleanupCount = 0;
      let errorCount = 0;

      for (const scan of oldScans) {
        try {
          await this.cleanupScan(scan.id, scan.requestId, scan.reportsDir);
          cleanupCount++;
        } catch (error) {
          errorCount++;
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.error(`Failed to cleanup scan ${scan.id}:`, errorMessage);
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
   * Clean up a single scan and its associated data
   */
  private async cleanupScan(scanId: string, requestId: string, reportsDir?: string | null): Promise<void> {
    // Delete from database (cascade will handle related records)
    await prisma.scan.delete({
      where: { id: scanId }
    });

    // Clean up report files
    if (reportsDir) {
      await this.cleanupReportDirectory(reportsDir);
    } else {
      // Fallback: use requestId to find report directory
      const defaultReportDir = path.join(this.workDir, 'reports', requestId);
      await this.cleanupReportDirectory(defaultReportDir);
    }

    logger.debug(`Cleaned up scan ${scanId} (${requestId})`);
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
      const orphanedItems = await prisma.bulkScanItem.findMany({
        where: {
          batch: {
            createdAt: {
              lt: cutoffDate
            }
          }
        },
        include: {
          batch: true
        }
      });

      if (orphanedItems.length > 0) {
        const batchIds = [...new Set(orphanedItems.map(item => item.batchId))];
        
        await prisma.bulkScanBatch.deleteMany({
          where: {
            id: {
              in: batchIds
            },
            createdAt: {
              lt: cutoffDate
            }
          }
        });

        logger.debug(`Cleaned up ${batchIds.length} old bulk scan batches`);
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