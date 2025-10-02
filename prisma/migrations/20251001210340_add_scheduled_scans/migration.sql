-- CreateEnum
CREATE TYPE "public"."ScheduledScanSource" AS ENUM ('MANUAL', 'AUTOMATED');

-- CreateEnum
CREATE TYPE "public"."ImageSelectionMode" AS ENUM ('SPECIFIC', 'PATTERN', 'ALL', 'REPOSITORY');

-- CreateEnum
CREATE TYPE "public"."ScheduledScanStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'PARTIAL');

-- CreateEnum
CREATE TYPE "public"."ScheduledScanTrigger" AS ENUM ('MANUAL', 'SCHEDULED', 'API');

-- CreateTable
CREATE TABLE "public"."scheduled_scans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "schedule" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "nextRunAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "source" "public"."ScheduledScanSource" NOT NULL DEFAULT 'MANUAL',
    "imageSelectionMode" "public"."ImageSelectionMode" NOT NULL DEFAULT 'SPECIFIC',
    "imagePattern" TEXT,

    CONSTRAINT "scheduled_scans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."scheduled_scan_images" (
    "id" TEXT NOT NULL,
    "scheduledScanId" TEXT NOT NULL,
    "imageId" TEXT NOT NULL,
    "imageName" TEXT NOT NULL,
    "imageTag" TEXT NOT NULL,
    "registry" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scheduled_scan_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."scheduled_scan_history" (
    "id" TEXT NOT NULL,
    "scheduledScanId" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "status" "public"."ScheduledScanStatus" NOT NULL DEFAULT 'RUNNING',
    "totalImages" INTEGER NOT NULL,
    "scannedImages" INTEGER NOT NULL DEFAULT 0,
    "failedImages" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "triggerSource" "public"."ScheduledScanTrigger" NOT NULL DEFAULT 'SCHEDULED',
    "triggeredBy" TEXT,
    "auditInfo" JSONB,

    CONSTRAINT "scheduled_scan_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."scheduled_scan_results" (
    "id" TEXT NOT NULL,
    "scheduledScanHistoryId" TEXT NOT NULL,
    "scanId" TEXT,
    "imageId" TEXT NOT NULL,
    "imageName" TEXT NOT NULL,
    "imageTag" TEXT NOT NULL,
    "status" "public"."ScanStatus" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "vulnerabilityCritical" INTEGER NOT NULL DEFAULT 0,
    "vulnerabilityHigh" INTEGER NOT NULL DEFAULT 0,
    "vulnerabilityMedium" INTEGER NOT NULL DEFAULT 0,
    "vulnerabilityLow" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,

    CONSTRAINT "scheduled_scan_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scheduled_scans_enabled_idx" ON "public"."scheduled_scans"("enabled");

-- CreateIndex
CREATE INDEX "scheduled_scans_nextRunAt_idx" ON "public"."scheduled_scans"("nextRunAt");

-- CreateIndex
CREATE INDEX "scheduled_scans_source_idx" ON "public"."scheduled_scans"("source");

-- CreateIndex
CREATE INDEX "scheduled_scan_images_scheduledScanId_idx" ON "public"."scheduled_scan_images"("scheduledScanId");

-- CreateIndex
CREATE INDEX "scheduled_scan_images_imageId_idx" ON "public"."scheduled_scan_images"("imageId");

-- CreateIndex
CREATE UNIQUE INDEX "scheduled_scan_images_scheduledScanId_imageId_key" ON "public"."scheduled_scan_images"("scheduledScanId", "imageId");

-- CreateIndex
CREATE UNIQUE INDEX "scheduled_scan_history_executionId_key" ON "public"."scheduled_scan_history"("executionId");

-- CreateIndex
CREATE INDEX "scheduled_scan_history_scheduledScanId_idx" ON "public"."scheduled_scan_history"("scheduledScanId");

-- CreateIndex
CREATE INDEX "scheduled_scan_history_startedAt_idx" ON "public"."scheduled_scan_history"("startedAt");

-- CreateIndex
CREATE INDEX "scheduled_scan_history_status_idx" ON "public"."scheduled_scan_history"("status");

-- CreateIndex
CREATE INDEX "scheduled_scan_history_executionId_idx" ON "public"."scheduled_scan_history"("executionId");

-- CreateIndex
CREATE INDEX "scheduled_scan_results_scheduledScanHistoryId_idx" ON "public"."scheduled_scan_results"("scheduledScanHistoryId");

-- CreateIndex
CREATE INDEX "scheduled_scan_results_scanId_idx" ON "public"."scheduled_scan_results"("scanId");

-- CreateIndex
CREATE INDEX "scheduled_scan_results_status_idx" ON "public"."scheduled_scan_results"("status");

-- AddForeignKey
ALTER TABLE "public"."scheduled_scan_images" ADD CONSTRAINT "scheduled_scan_images_scheduledScanId_fkey" FOREIGN KEY ("scheduledScanId") REFERENCES "public"."scheduled_scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."scheduled_scan_images" ADD CONSTRAINT "scheduled_scan_images_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "public"."images"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."scheduled_scan_history" ADD CONSTRAINT "scheduled_scan_history_scheduledScanId_fkey" FOREIGN KEY ("scheduledScanId") REFERENCES "public"."scheduled_scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."scheduled_scan_results" ADD CONSTRAINT "scheduled_scan_results_scheduledScanHistoryId_fkey" FOREIGN KEY ("scheduledScanHistoryId") REFERENCES "public"."scheduled_scan_history"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."scheduled_scan_results" ADD CONSTRAINT "scheduled_scan_results_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "public"."scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
