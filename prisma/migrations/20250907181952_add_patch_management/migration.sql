-- CreateEnum
CREATE TYPE "public"."PatchStatus" AS ENUM ('NOT_ATTEMPTED', 'ANALYZING', 'PATCHABLE', 'NOT_PATCHABLE', 'PATCHING', 'PATCHED', 'PATCH_FAILED');

-- CreateEnum
CREATE TYPE "public"."PatchOperationStatus" AS ENUM ('PENDING', 'ANALYZING', 'BUILDING', 'PATCHING', 'PUSHING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."PatchResultStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "public"."PatchStrategy" AS ENUM ('APT', 'YUM', 'APK', 'NPM', 'PIP', 'MULTI');

-- DropIndex
DROP INDEX "public"."grype_vulnerabilities_grypeResultsId_severity_idx";

-- DropIndex
DROP INDEX "public"."osv_vulnerabilities_osvResultsId_packageName_idx";

-- DropIndex
DROP INDEX "public"."scan_metadata_vulnerabilityCritical_vulnerabilityHigh_idx";

-- DropIndex
DROP INDEX "public"."scans_status_finishedAt_idx";

-- DropIndex
DROP INDEX "public"."syft_packages_syftResultsId_type_name_idx";

-- DropIndex
DROP INDEX "public"."trivy_vulnerabilities_trivyResultsId_severity_idx";

-- AlterTable
ALTER TABLE "public"."image_vulnerabilities" ADD COLUMN     "patchStatus" "public"."PatchStatus" NOT NULL DEFAULT 'NOT_ATTEMPTED';

-- CreateTable
CREATE TABLE "public"."patch_operations" (
    "id" TEXT NOT NULL,
    "sourceImageId" TEXT NOT NULL,
    "patchedImageId" TEXT,
    "scanId" TEXT NOT NULL,
    "status" "public"."PatchOperationStatus" NOT NULL DEFAULT 'PENDING',
    "strategy" "public"."PatchStrategy" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "vulnerabilitiesCount" INTEGER NOT NULL DEFAULT 0,
    "patchedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "buildahContainerId" TEXT,
    "buildahMountPath" TEXT,
    "patchedImageRegistry" TEXT,
    "patchedImageName" TEXT,
    "patchedImageTag" TEXT,
    "patchedImageDigest" TEXT,

    CONSTRAINT "patch_operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."patch_results" (
    "id" TEXT NOT NULL,
    "patchOperationId" TEXT NOT NULL,
    "vulnerabilityId" TEXT NOT NULL,
    "cveId" TEXT NOT NULL,
    "packageName" TEXT NOT NULL,
    "originalVersion" TEXT,
    "targetVersion" TEXT,
    "patchCommand" TEXT NOT NULL,
    "status" "public"."PatchResultStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "executedAt" TIMESTAMP(3),
    "packageManager" TEXT NOT NULL,

    CONSTRAINT "patch_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."patched_images" (
    "id" TEXT NOT NULL,
    "originalImageId" TEXT NOT NULL,
    "patchedImageId" TEXT NOT NULL,
    "patchOperationId" TEXT NOT NULL,
    "originalCveCount" INTEGER NOT NULL,
    "remainingCveCount" INTEGER NOT NULL,
    "patchedCveCount" INTEGER NOT NULL,
    "patchEfficiency" DOUBLE PRECISION NOT NULL,
    "originalSize" BIGINT,
    "patchedSize" BIGINT,
    "sizeDelta" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patched_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."_ImageVulnerabilityToPatchOperation" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ImageVulnerabilityToPatchOperation_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "patch_operations_sourceImageId_idx" ON "public"."patch_operations"("sourceImageId");

-- CreateIndex
CREATE INDEX "patch_operations_patchedImageId_idx" ON "public"."patch_operations"("patchedImageId");

-- CreateIndex
CREATE INDEX "patch_operations_scanId_idx" ON "public"."patch_operations"("scanId");

-- CreateIndex
CREATE INDEX "patch_operations_status_idx" ON "public"."patch_operations"("status");

-- CreateIndex
CREATE INDEX "patch_operations_startedAt_idx" ON "public"."patch_operations"("startedAt");

-- CreateIndex
CREATE INDEX "patch_results_patchOperationId_idx" ON "public"."patch_results"("patchOperationId");

-- CreateIndex
CREATE INDEX "patch_results_vulnerabilityId_idx" ON "public"."patch_results"("vulnerabilityId");

-- CreateIndex
CREATE INDEX "patch_results_status_idx" ON "public"."patch_results"("status");

-- CreateIndex
CREATE UNIQUE INDEX "patched_images_patchedImageId_key" ON "public"."patched_images"("patchedImageId");

-- CreateIndex
CREATE UNIQUE INDEX "patched_images_patchOperationId_key" ON "public"."patched_images"("patchOperationId");

-- CreateIndex
CREATE INDEX "patched_images_originalImageId_idx" ON "public"."patched_images"("originalImageId");

-- CreateIndex
CREATE INDEX "patched_images_patchedImageId_idx" ON "public"."patched_images"("patchedImageId");

-- CreateIndex
CREATE INDEX "patched_images_createdAt_idx" ON "public"."patched_images"("createdAt");

-- CreateIndex
CREATE INDEX "_ImageVulnerabilityToPatchOperation_B_index" ON "public"."_ImageVulnerabilityToPatchOperation"("B");

-- CreateIndex
CREATE INDEX "image_vulnerabilities_patchStatus_idx" ON "public"."image_vulnerabilities"("patchStatus");

-- AddForeignKey
ALTER TABLE "public"."patch_operations" ADD CONSTRAINT "patch_operations_sourceImageId_fkey" FOREIGN KEY ("sourceImageId") REFERENCES "public"."images"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."patch_operations" ADD CONSTRAINT "patch_operations_patchedImageId_fkey" FOREIGN KEY ("patchedImageId") REFERENCES "public"."images"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."patch_operations" ADD CONSTRAINT "patch_operations_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "public"."scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."patch_results" ADD CONSTRAINT "patch_results_patchOperationId_fkey" FOREIGN KEY ("patchOperationId") REFERENCES "public"."patch_operations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."patched_images" ADD CONSTRAINT "patched_images_originalImageId_fkey" FOREIGN KEY ("originalImageId") REFERENCES "public"."images"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."patched_images" ADD CONSTRAINT "patched_images_patchedImageId_fkey" FOREIGN KEY ("patchedImageId") REFERENCES "public"."images"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_ImageVulnerabilityToPatchOperation" ADD CONSTRAINT "_ImageVulnerabilityToPatchOperation_A_fkey" FOREIGN KEY ("A") REFERENCES "public"."image_vulnerabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."_ImageVulnerabilityToPatchOperation" ADD CONSTRAINT "_ImageVulnerabilityToPatchOperation_B_fkey" FOREIGN KEY ("B") REFERENCES "public"."patch_operations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
