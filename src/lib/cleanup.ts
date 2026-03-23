/**
 * Database cleanup utilities for Harbor Guard
 * Handles automatic cleanup of old scans based on configuration.
 * Settings are read from the app_settings table (UI-configurable),
 * falling back to CLEANUP_OLD_SCANS_DAYS env var, then default of 30.
 */

import { config } from './config';
import { logger } from './logger';
import { prisma } from './prisma';
import { DashboardS3Client } from './storage/s3';
import fs from 'fs/promises';
import path from 'path';

async function getRetentionSettings() {
  const defaults = {
    cleanupOldScansDays: config.cleanupOldScansDays,
    cleanupAuditLogsDays: config.cleanupOldScansDays,
    cleanupBulkScansDays: config.cleanupOldScansDays,
    cleanupS3Artifacts: true,
  };
  try {
    const rows = await prisma.appSetting.findMany();
    for (const row of rows) {
      if (row.key === 'cleanupOldScansDays') defaults.cleanupOldScansDays = parseInt(row.value) || defaults.cleanupOldScansDays;
      if (row.key === 'cleanupAuditLogsDays') defaults.cleanupAuditLogsDays = parseInt(row.value) || defaults.cleanupAuditLogsDays;
      if (row.key === 'cleanupBulkScansDays') defaults.cleanupBulkScansDays = parseInt(row.value) || defaults.cleanupBulkScansDays;
      if (row.key === 'cleanupS3Artifacts') defaults.cleanupS3Artifacts = row.value !== 'false';
    }
  } catch { /* use defaults if table doesn't exist yet */ }
  return defaults;
}

export class DatabaseCleanup {
  private workDir = process.env.SCANNER_WORKDIR || '/workspace';

  /**
   * Clean up old scans and their associated data
   */
  async cleanupOldScans(): Promise<void> {
    try {
      const retention = await getRetentionSettings();

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retention.cleanupOldScansDays);

      logger.info(`Starting cleanup of scans older than ${retention.cleanupOldScansDays} days (before ${cutoffDate.toISOString()})`);

      let cleanupCount = 0;
      let errorCount = 0;
      const MAX_ITERATIONS = 1000; // Safety guard against infinite loops

      // Process in batches of 100 to prevent memory exhaustion
      let reachedLimit = false;
      for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
        if (iteration === MAX_ITERATIONS - 1) reachedLimit = true;

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
            metadata: { select: { s3Prefix: true } },
            agentJobs: { select: { id: true }, take: 1 },
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

        // Clean up S3 artifacts before deleting DB records
        if (retention.cleanupS3Artifacts && DashboardS3Client.isConfigured()) {
          try {
            const s3 = DashboardS3Client.getInstance();
            for (const scan of batch) {
              try {
                const prefix = scan.metadata?.s3Prefix
                  || (scan.agentJobs?.[0]?.id ? `scans/${scan.agentJobs[0].id}/` : null);
                if (prefix) {
                  await s3.deletePrefix(prefix);
                }
              } catch (s3Err) {
                // Non-fatal: S3 failures should not block DB cleanup
                logger.warn(`Failed to delete S3 artifacts for scan ${scan.id}:`, s3Err);
              }
            }
          } catch (s3InitErr) {
            logger.warn('Failed to initialize S3 client for cleanup:', s3InitErr);
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

      if (reachedLimit) {
        logger.warn(`Cleanup reached max iteration limit (${MAX_ITERATIONS}); some old scans may remain`);
      }

      // Clean up orphaned bulk scan items (may have independent retention)
      const bulkCutoff = new Date();
      bulkCutoff.setDate(bulkCutoff.getDate() - retention.cleanupBulkScansDays);
      await this.cleanupOrphanedBulkScanItems(bulkCutoff);

      // Clean up orphaned audit logs (may have independent retention)
      const auditCutoff = new Date();
      auditCutoff.setDate(auditCutoff.getDate() - retention.cleanupAuditLogsDays);
      await this.cleanupOldAuditLogs(auditCutoff);

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
      const MAX_BATCH_ITERATIONS = 1000;

      // Process in batches of 100 to prevent memory exhaustion
      for (let iteration = 0; iteration < MAX_BATCH_ITERATIONS; iteration++) {
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

let cleanupScheduled = false;
export function scheduleAutoCleanup() {
  if (cleanupScheduled) return;
  cleanupScheduled = true;
  setTimeout(() => databaseCleanup.cleanupOldScans().catch(console.error), 30_000);
  setInterval(() => databaseCleanup.cleanupOldScans().catch(console.error), 24 * 60 * 60 * 1000);
}