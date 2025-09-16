/*
  Warnings:

  - The `syncStatus` column on the `repository_images` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "public"."RepositoryType" ADD VALUE 'ECR';
ALTER TYPE "public"."RepositoryType" ADD VALUE 'GCR';
ALTER TYPE "public"."RepositoryType" ADD VALUE 'ACR';
ALTER TYPE "public"."RepositoryType" ADD VALUE 'HARBOR';
ALTER TYPE "public"."RepositoryType" ADD VALUE 'NEXUS';
ALTER TYPE "public"."RepositoryType" ADD VALUE 'ARTIFACTORY';
ALTER TYPE "public"."RepositoryType" ADD VALUE 'QUAY';

-- DropIndex
DROP INDEX "public"."images_registry_idx";

-- DropIndex
DROP INDEX "public"."images_registry_name_tag_idx";

-- AlterTable
ALTER TABLE "public"."repository_images" DROP COLUMN "syncStatus",
ADD COLUMN     "syncStatus" "public"."SyncStatus" NOT NULL DEFAULT 'PENDING';

-- CreateIndex
CREATE INDEX "image_vulnerabilities_detectedAt_idx" ON "public"."image_vulnerabilities"("detectedAt");

-- CreateIndex
CREATE INDEX "scan_metadata_vulnerabilityCritical_vulnerabilityHigh_idx" ON "public"."scan_metadata"("vulnerabilityCritical", "vulnerabilityHigh");
