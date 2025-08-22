/*
  Warnings:

  - You are about to drop the `scan_schedules` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `scan_templates` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `scanner_configs` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `scheduled_scan_executions` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropIndex
DROP INDEX "scan_schedules_templateId_idx";

-- DropIndex
DROP INDEX "scan_schedules_nextRunAt_idx";

-- DropIndex
DROP INDEX "scan_schedules_status_idx";

-- DropIndex
DROP INDEX "scan_templates_isDefault_idx";

-- DropIndex
DROP INDEX "scan_templates_environment_idx";

-- DropIndex
DROP INDEX "scanner_configs_environment_idx";

-- DropIndex
DROP INDEX "scanner_configs_templateId_idx";

-- DropIndex
DROP INDEX "scanner_configs_scannerId_idx";

-- DropIndex
DROP INDEX "scheduled_scan_executions_status_idx";

-- DropIndex
DROP INDEX "scheduled_scan_executions_executionTime_idx";

-- DropIndex
DROP INDEX "scheduled_scan_executions_scheduleId_idx";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "scan_schedules";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "scan_templates";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "scanner_configs";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "scheduled_scan_executions";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_images" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "registry" TEXT,
    "source" TEXT NOT NULL DEFAULT 'REGISTRY',
    "digest" TEXT NOT NULL,
    "platform" TEXT,
    "sizeBytes" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_images" ("createdAt", "digest", "id", "name", "platform", "registry", "sizeBytes", "tag", "updatedAt") SELECT "createdAt", "digest", "id", "name", "platform", "registry", "sizeBytes", "tag", "updatedAt" FROM "images";
DROP TABLE "images";
ALTER TABLE "new_images" RENAME TO "images";
CREATE UNIQUE INDEX "images_digest_key" ON "images"("digest");
CREATE INDEX "images_name_tag_idx" ON "images"("name", "tag");
CREATE INDEX "images_registry_name_tag_idx" ON "images"("registry", "name", "tag");
CREATE INDEX "images_digest_idx" ON "images"("digest");
CREATE INDEX "images_registry_idx" ON "images"("registry");
CREATE INDEX "images_source_idx" ON "images"("source");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
