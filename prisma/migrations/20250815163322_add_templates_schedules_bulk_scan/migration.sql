-- CreateTable
CREATE TABLE "scan_schedules" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "cronExpression" TEXT NOT NULL,
    "scanRequest" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastRunAt" DATETIME,
    "nextRunAt" DATETIME,
    "createdBy" TEXT
);

-- CreateTable
CREATE TABLE "scheduled_scan_executions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scheduleId" TEXT NOT NULL,
    "scanId" TEXT,
    "executionTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    CONSTRAINT "scheduled_scan_executions_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "scan_schedules" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "scheduled_scan_executions_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "scans" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "scan_templates" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "environment" TEXT NOT NULL,
    "scannerConfig" JSONB NOT NULL,
    "policyConfig" JSONB,
    "notificationConfig" JSONB,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdBy" TEXT
);

-- CreateTable
CREATE TABLE "bulk_scan_batches" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "totalImages" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "patterns" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "completedAt" DATETIME,
    "errorMessage" TEXT
);

-- CreateTable
CREATE TABLE "bulk_scan_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchId" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "imageId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    CONSTRAINT "bulk_scan_items_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "bulk_scan_batches" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "bulk_scan_items_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "scans" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "bulk_scan_items_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "images" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "scan_schedules_isActive_idx" ON "scan_schedules"("isActive");

-- CreateIndex
CREATE INDEX "scan_schedules_nextRunAt_idx" ON "scan_schedules"("nextRunAt");

-- CreateIndex
CREATE INDEX "scheduled_scan_executions_scheduleId_idx" ON "scheduled_scan_executions"("scheduleId");

-- CreateIndex
CREATE INDEX "scheduled_scan_executions_executionTime_idx" ON "scheduled_scan_executions"("executionTime");

-- CreateIndex
CREATE INDEX "scan_templates_environment_idx" ON "scan_templates"("environment");

-- CreateIndex
CREATE INDEX "scan_templates_isDefault_idx" ON "scan_templates"("isDefault");

-- CreateIndex
CREATE INDEX "bulk_scan_batches_status_idx" ON "bulk_scan_batches"("status");

-- CreateIndex
CREATE INDEX "bulk_scan_batches_createdAt_idx" ON "bulk_scan_batches"("createdAt");

-- CreateIndex
CREATE INDEX "bulk_scan_items_batchId_idx" ON "bulk_scan_items"("batchId");

-- CreateIndex
CREATE INDEX "bulk_scan_items_status_idx" ON "bulk_scan_items"("status");
