-- CreateEnum - Create SyncStatus if it doesn't exist
DO $$ BEGIN
    CREATE TYPE "SyncStatus" AS ENUM ('PENDING', 'SYNCING', 'COMPLETED', 'FAILED', 'STALE');
EXCEPTION
    WHEN duplicate_object THEN
        -- If type already exists, add missing values
        ALTER TYPE "SyncStatus" ADD VALUE IF NOT EXISTS 'COMPLETED';
        ALTER TYPE "SyncStatus" ADD VALUE IF NOT EXISTS 'STALE';
END$$;