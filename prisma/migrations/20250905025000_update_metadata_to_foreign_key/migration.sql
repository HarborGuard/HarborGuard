-- Step 1: Add the metadataId column to scans table
ALTER TABLE "scans" ADD COLUMN "metadataId" TEXT;

-- Step 2: Create unique index on metadataId
CREATE UNIQUE INDEX "scans_metadataId_key" ON "scans"("metadataId");

-- Step 3: Create regular index on metadataId for performance
CREATE INDEX "scans_metadataId_idx" ON "scans"("metadataId");

-- Step 4: Update existing scans to link to their metadata
UPDATE "scans" s
SET "metadataId" = sm.id
FROM "scan_metadata" sm
WHERE s.id = sm."scanId";

-- Step 5: Drop the scanId column from scan_metadata
ALTER TABLE "scan_metadata" DROP COLUMN "scanId";

-- Step 6: Drop the old index on scanId that no longer exists
DROP INDEX IF EXISTS "scan_metadata_scanId_idx";

-- Step 7: Drop the old metadata JSON column from scans
ALTER TABLE "scans" DROP COLUMN "metadata";

-- Step 8: Add foreign key constraint
ALTER TABLE "scans" ADD CONSTRAINT "scans_metadataId_fkey" 
  FOREIGN KEY ("metadataId") REFERENCES "scan_metadata"("id") 
  ON DELETE SET NULL ON UPDATE CASCADE;