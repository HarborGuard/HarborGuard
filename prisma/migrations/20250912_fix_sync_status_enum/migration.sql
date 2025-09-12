-- Create SyncStatus enum if it doesn't exist, or add missing values
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SyncStatus') THEN
    CREATE TYPE "public"."SyncStatus" AS ENUM ('PENDING', 'SYNCING', 'COMPLETED', 'FAILED', 'STALE');
  ELSE
    -- Add missing values if enum exists
    ALTER TYPE "public"."SyncStatus" ADD VALUE IF NOT EXISTS 'COMPLETED';
    ALTER TYPE "public"."SyncStatus" ADD VALUE IF NOT EXISTS 'STALE';
  END IF;
END $$;