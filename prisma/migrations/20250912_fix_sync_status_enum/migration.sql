-- AlterEnum - Add missing values to SyncStatus
ALTER TYPE "SyncStatus" ADD VALUE IF NOT EXISTS 'COMPLETED';
ALTER TYPE "SyncStatus" ADD VALUE IF NOT EXISTS 'STALE';