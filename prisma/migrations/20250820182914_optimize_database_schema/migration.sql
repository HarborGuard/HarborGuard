/*
  Warnings:

  - You are about to drop the column `cveId` on the `cve_classifications` table. All the data in the column will be lost.
  - You are about to alter the column `sizeBytes` on the `images` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Int`.
  - You are about to drop the column `isActive` on the `scan_schedules` table. All the data in the column will be lost.
  - You are about to drop the column `scannerConfig` on the `scan_templates` table. All the data in the column will be lost.
  - You are about to drop the column `complianceScore` on the `scans` table. All the data in the column will be lost.
  - You are about to drop the column `dive` on the `scans` table. All the data in the column will be lost.
  - You are about to drop the column `dockle` on the `scans` table. All the data in the column will be lost.
  - You are about to drop the column `grype` on the `scans` table. All the data in the column will be lost.
  - You are about to drop the column `osv` on the `scans` table. All the data in the column will be lost.
  - You are about to drop the column `scanConfig` on the `scans` table. All the data in the column will be lost.
  - You are about to drop the column `scannerVersions` on the `scans` table. All the data in the column will be lost.
  - You are about to drop the column `sizeBytes` on the `scans` table. All the data in the column will be lost.
  - You are about to drop the column `syft` on the `scans` table. All the data in the column will be lost.
  - You are about to drop the column `trivy` on the `scans` table. All the data in the column will be lost.
  - You are about to drop the column `vulnerabilityCount` on the `scans` table. All the data in the column will be lost.
  - Added the required column `imageVulnerabilityId` to the `cve_classifications` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "scan_results" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scanId" TEXT NOT NULL,
    "scannerId" TEXT NOT NULL,
    "rawOutput" JSONB,
    "status" TEXT NOT NULL DEFAULT 'SUCCESS',
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "scan_results_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "scans" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "scan_results_scannerId_fkey" FOREIGN KEY ("scannerId") REFERENCES "scanners" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "scanners" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "defaultConfig" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "scanner_configs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scannerId" TEXT NOT NULL,
    "templateId" TEXT,
    "environment" TEXT NOT NULL,
    "configuration" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "scanner_configs_scannerId_fkey" FOREIGN KEY ("scannerId") REFERENCES "scanners" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "scanner_configs_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "scan_templates" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "vulnerabilities" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cveId" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "severity" TEXT NOT NULL,
    "cvssScore" REAL,
    "source" TEXT,
    "publishedAt" DATETIME,
    "modifiedAt" DATETIME
);

-- CreateTable
CREATE TABLE "image_vulnerabilities" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "imageId" TEXT NOT NULL,
    "vulnerabilityId" TEXT NOT NULL,
    "packageName" TEXT NOT NULL,
    "installedVersion" TEXT,
    "fixedVersion" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DETECTED',
    "detectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "image_vulnerabilities_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "images" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "image_vulnerabilities_vulnerabilityId_fkey" FOREIGN KEY ("vulnerabilityId") REFERENCES "vulnerabilities" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "policy_rules" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "conditions" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "policy_violations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scanId" TEXT NOT NULL,
    "policyRuleId" TEXT NOT NULL,
    "description" TEXT,
    "severity" TEXT NOT NULL,
    "details" JSONB,
    "detectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "policy_violations_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "scans" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "policy_violations_policyRuleId_fkey" FOREIGN KEY ("policyRuleId") REFERENCES "policy_rules" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_cve_classifications" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "imageVulnerabilityId" TEXT NOT NULL,
    "isFalsePositive" BOOLEAN NOT NULL DEFAULT false,
    "comment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdBy" TEXT,
    "imageId" TEXT NOT NULL,
    CONSTRAINT "cve_classifications_imageVulnerabilityId_fkey" FOREIGN KEY ("imageVulnerabilityId") REFERENCES "image_vulnerabilities" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "cve_classifications_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "images" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_cve_classifications" ("comment", "createdAt", "createdBy", "id", "imageId", "isFalsePositive", "updatedAt") SELECT "comment", "createdAt", "createdBy", "id", "imageId", "isFalsePositive", "updatedAt" FROM "cve_classifications";
DROP TABLE "cve_classifications";
ALTER TABLE "new_cve_classifications" RENAME TO "cve_classifications";
CREATE INDEX "cve_classifications_imageVulnerabilityId_idx" ON "cve_classifications"("imageVulnerabilityId");
CREATE INDEX "cve_classifications_imageId_idx" ON "cve_classifications"("imageId");
CREATE INDEX "cve_classifications_isFalsePositive_idx" ON "cve_classifications"("isFalsePositive");
CREATE TABLE "new_images" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "registry" TEXT,
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
CREATE TABLE "new_scan_schedules" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT,
    "name" TEXT NOT NULL,
    "cronExpression" TEXT NOT NULL,
    "scanRequest" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastRunAt" DATETIME,
    "nextRunAt" DATETIME,
    "createdBy" TEXT,
    CONSTRAINT "scan_schedules_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "scan_templates" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_scan_schedules" ("createdAt", "createdBy", "cronExpression", "id", "lastRunAt", "name", "nextRunAt", "scanRequest", "updatedAt") SELECT "createdAt", "createdBy", "cronExpression", "id", "lastRunAt", "name", "nextRunAt", "scanRequest", "updatedAt" FROM "scan_schedules";
DROP TABLE "scan_schedules";
ALTER TABLE "new_scan_schedules" RENAME TO "scan_schedules";
CREATE INDEX "scan_schedules_status_idx" ON "scan_schedules"("status");
CREATE INDEX "scan_schedules_nextRunAt_idx" ON "scan_schedules"("nextRunAt");
CREATE INDEX "scan_schedules_templateId_idx" ON "scan_schedules"("templateId");
CREATE TABLE "new_scan_templates" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "environment" TEXT NOT NULL,
    "policyConfig" JSONB,
    "notificationConfig" JSONB,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdBy" TEXT
);
INSERT INTO "new_scan_templates" ("createdAt", "createdBy", "description", "environment", "id", "isDefault", "name", "notificationConfig", "policyConfig", "updatedAt") SELECT "createdAt", "createdBy", "description", "environment", "id", "isDefault", "name", "notificationConfig", "policyConfig", "updatedAt" FROM "scan_templates";
DROP TABLE "scan_templates";
ALTER TABLE "new_scan_templates" RENAME TO "scan_templates";
CREATE INDEX "scan_templates_environment_idx" ON "scan_templates"("environment");
CREATE INDEX "scan_templates_isDefault_idx" ON "scan_templates"("isDefault");
CREATE TABLE "new_scans" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "imageId" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL,
    "finishedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "reportsDir" TEXT,
    "errorMessage" TEXT,
    "riskScore" INTEGER,
    "metadata" JSONB,
    "source" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "scans_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "images" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_scans" ("createdAt", "errorMessage", "finishedAt", "id", "imageId", "metadata", "reportsDir", "requestId", "riskScore", "source", "startedAt", "status", "updatedAt") SELECT "createdAt", "errorMessage", "finishedAt", "id", "imageId", "metadata", "reportsDir", "requestId", "riskScore", "source", "startedAt", "status", "updatedAt" FROM "scans";
DROP TABLE "scans";
ALTER TABLE "new_scans" RENAME TO "scans";
CREATE UNIQUE INDEX "scans_requestId_key" ON "scans"("requestId");
CREATE INDEX "scans_requestId_idx" ON "scans"("requestId");
CREATE INDEX "scans_status_idx" ON "scans"("status");
CREATE INDEX "scans_startedAt_idx" ON "scans"("startedAt");
CREATE INDEX "scans_imageId_idx" ON "scans"("imageId");
CREATE INDEX "scans_imageId_status_idx" ON "scans"("imageId", "status");
CREATE INDEX "scans_imageId_startedAt_idx" ON "scans"("imageId", "startedAt");
CREATE INDEX "scans_status_startedAt_idx" ON "scans"("status", "startedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "scan_results_scanId_idx" ON "scan_results"("scanId");

-- CreateIndex
CREATE INDEX "scan_results_scannerId_idx" ON "scan_results"("scannerId");

-- CreateIndex
CREATE INDEX "scan_results_status_idx" ON "scan_results"("status");

-- CreateIndex
CREATE UNIQUE INDEX "scanners_name_key" ON "scanners"("name");

-- CreateIndex
CREATE INDEX "scanners_name_idx" ON "scanners"("name");

-- CreateIndex
CREATE INDEX "scanners_type_idx" ON "scanners"("type");

-- CreateIndex
CREATE INDEX "scanners_isActive_idx" ON "scanners"("isActive");

-- CreateIndex
CREATE INDEX "scanner_configs_scannerId_idx" ON "scanner_configs"("scannerId");

-- CreateIndex
CREATE INDEX "scanner_configs_templateId_idx" ON "scanner_configs"("templateId");

-- CreateIndex
CREATE INDEX "scanner_configs_environment_idx" ON "scanner_configs"("environment");

-- CreateIndex
CREATE UNIQUE INDEX "vulnerabilities_cveId_key" ON "vulnerabilities"("cveId");

-- CreateIndex
CREATE INDEX "vulnerabilities_cveId_idx" ON "vulnerabilities"("cveId");

-- CreateIndex
CREATE INDEX "vulnerabilities_severity_idx" ON "vulnerabilities"("severity");

-- CreateIndex
CREATE INDEX "vulnerabilities_cvssScore_idx" ON "vulnerabilities"("cvssScore");

-- CreateIndex
CREATE INDEX "image_vulnerabilities_imageId_idx" ON "image_vulnerabilities"("imageId");

-- CreateIndex
CREATE INDEX "image_vulnerabilities_vulnerabilityId_idx" ON "image_vulnerabilities"("vulnerabilityId");

-- CreateIndex
CREATE INDEX "image_vulnerabilities_status_idx" ON "image_vulnerabilities"("status");

-- CreateIndex
CREATE INDEX "image_vulnerabilities_packageName_idx" ON "image_vulnerabilities"("packageName");

-- CreateIndex
CREATE UNIQUE INDEX "image_vulnerabilities_imageId_vulnerabilityId_packageName_key" ON "image_vulnerabilities"("imageId", "vulnerabilityId", "packageName");

-- CreateIndex
CREATE INDEX "policy_rules_category_idx" ON "policy_rules"("category");

-- CreateIndex
CREATE INDEX "policy_rules_severity_idx" ON "policy_rules"("severity");

-- CreateIndex
CREATE INDEX "policy_rules_isActive_idx" ON "policy_rules"("isActive");

-- CreateIndex
CREATE INDEX "policy_violations_scanId_idx" ON "policy_violations"("scanId");

-- CreateIndex
CREATE INDEX "policy_violations_policyRuleId_idx" ON "policy_violations"("policyRuleId");

-- CreateIndex
CREATE INDEX "policy_violations_severity_idx" ON "policy_violations"("severity");

-- CreateIndex
CREATE INDEX "policy_violations_detectedAt_idx" ON "policy_violations"("detectedAt");

-- CreateIndex
CREATE INDEX "scheduled_scan_executions_status_idx" ON "scheduled_scan_executions"("status");
