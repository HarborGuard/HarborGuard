-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."RepositoryType" AS ENUM ('DOCKERHUB', 'GHCR', 'GENERIC');

-- CreateEnum
CREATE TYPE "public"."RepositoryStatus" AS ENUM ('UNTESTED', 'ACTIVE', 'ERROR');

-- CreateEnum
CREATE TYPE "public"."ScanStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."ScanResultStatus" AS ENUM ('SUCCESS', 'FAILED', 'PARTIAL');

-- CreateEnum
CREATE TYPE "public"."ScannerType" AS ENUM ('VULNERABILITY', 'COMPLIANCE', 'SBOM', 'ANALYSIS');

-- CreateEnum
CREATE TYPE "public"."BatchStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."ItemStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."Severity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO');

-- CreateEnum
CREATE TYPE "public"."VulnerabilityStatus" AS ENUM ('DETECTED', 'FIXED', 'IGNORED', 'FALSE_POSITIVE');

-- CreateEnum
CREATE TYPE "public"."ImageSource" AS ENUM ('REGISTRY', 'LOCAL_DOCKER', 'FILE_UPLOAD', 'REGISTRY_PRIVATE');

-- CreateEnum
CREATE TYPE "public"."PolicyCategory" AS ENUM ('SECURITY', 'COMPLIANCE', 'BEST_PRACTICES', 'CUSTOM');

-- CreateEnum
CREATE TYPE "public"."EventType" AS ENUM ('SCAN_START', 'SCAN_COMPLETE', 'SCAN_FAILED', 'IMAGE_ADDED', 'IMAGE_REMOVED', 'USER_LOGIN', 'CONFIG_CHANGE', 'SYSTEM_EVENT');

-- CreateEnum
CREATE TYPE "public"."LogCategory" AS ENUM ('SECURITY', 'OPERATIONAL', 'INFORMATIVE', 'ERROR');

-- CreateEnum
CREATE TYPE "public"."LogAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'VIEW', 'SCAN', 'UPLOAD', 'DOWNLOAD', 'LOGIN', 'LOGOUT');

-- CreateTable
CREATE TABLE "public"."images" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "registry" TEXT,
    "source" "public"."ImageSource" NOT NULL DEFAULT 'REGISTRY',
    "digest" TEXT NOT NULL,
    "platform" TEXT,
    "sizeBytes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."scans" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "imageId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "status" "public"."ScanStatus" NOT NULL DEFAULT 'RUNNING',
    "reportsDir" TEXT,
    "errorMessage" TEXT,
    "riskScore" INTEGER,
    "metadata" JSONB,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."scan_results" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "scannerId" TEXT NOT NULL,
    "rawOutput" JSONB,
    "status" "public"."ScanResultStatus" NOT NULL DEFAULT 'SUCCESS',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scan_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."scanners" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "type" "public"."ScannerType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "defaultConfig" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scanners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."bulk_scan_batches" (
    "id" TEXT NOT NULL,
    "totalImages" INTEGER NOT NULL,
    "status" "public"."BatchStatus" NOT NULL,
    "patterns" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "name" TEXT,

    CONSTRAINT "bulk_scan_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."bulk_scan_items" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "imageId" TEXT NOT NULL,
    "status" "public"."ItemStatus" NOT NULL,

    CONSTRAINT "bulk_scan_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."vulnerabilities" (
    "id" TEXT NOT NULL,
    "cveId" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "severity" "public"."Severity" NOT NULL,
    "cvssScore" DOUBLE PRECISION,
    "source" TEXT,
    "publishedAt" TIMESTAMP(3),
    "modifiedAt" TIMESTAMP(3),

    CONSTRAINT "vulnerabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."image_vulnerabilities" (
    "id" TEXT NOT NULL,
    "imageId" TEXT NOT NULL,
    "vulnerabilityId" TEXT NOT NULL,
    "packageName" TEXT NOT NULL,
    "installedVersion" TEXT,
    "fixedVersion" TEXT,
    "status" "public"."VulnerabilityStatus" NOT NULL DEFAULT 'DETECTED',
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "image_vulnerabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."cve_classifications" (
    "id" TEXT NOT NULL,
    "imageVulnerabilityId" TEXT NOT NULL,
    "isFalsePositive" BOOLEAN NOT NULL DEFAULT false,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "imageId" TEXT NOT NULL,

    CONSTRAINT "cve_classifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."policy_rules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "public"."PolicyCategory" NOT NULL,
    "severity" "public"."Severity" NOT NULL,
    "conditions" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "policy_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."policy_violations" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "policyRuleId" TEXT NOT NULL,
    "description" TEXT,
    "severity" "public"."Severity" NOT NULL,
    "details" JSONB,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_violations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."audit_logs" (
    "id" TEXT NOT NULL,
    "eventType" "public"."EventType" NOT NULL,
    "category" "public"."LogCategory" NOT NULL,
    "userIp" TEXT NOT NULL,
    "userAgent" TEXT,
    "userId" TEXT,
    "resource" TEXT,
    "action" "public"."LogAction" NOT NULL,
    "details" JSONB,
    "metadata" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."repositories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "public"."RepositoryType" NOT NULL,
    "registryUrl" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "encryptedPassword" TEXT NOT NULL,
    "organization" TEXT,
    "status" "public"."RepositoryStatus" NOT NULL DEFAULT 'UNTESTED',
    "lastTested" TIMESTAMP(3),
    "repositoryCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repositories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "images_digest_key" ON "public"."images"("digest");

-- CreateIndex
CREATE INDEX "images_name_tag_idx" ON "public"."images"("name", "tag");

-- CreateIndex
CREATE INDEX "images_registry_name_tag_idx" ON "public"."images"("registry", "name", "tag");

-- CreateIndex
CREATE INDEX "images_digest_idx" ON "public"."images"("digest");

-- CreateIndex
CREATE INDEX "images_registry_idx" ON "public"."images"("registry");

-- CreateIndex
CREATE INDEX "images_source_idx" ON "public"."images"("source");

-- CreateIndex
CREATE UNIQUE INDEX "scans_requestId_key" ON "public"."scans"("requestId");

-- CreateIndex
CREATE INDEX "scans_requestId_idx" ON "public"."scans"("requestId");

-- CreateIndex
CREATE INDEX "scans_status_idx" ON "public"."scans"("status");

-- CreateIndex
CREATE INDEX "scans_startedAt_idx" ON "public"."scans"("startedAt");

-- CreateIndex
CREATE INDEX "scans_imageId_idx" ON "public"."scans"("imageId");

-- CreateIndex
CREATE INDEX "scans_imageId_status_idx" ON "public"."scans"("imageId", "status");

-- CreateIndex
CREATE INDEX "scans_imageId_startedAt_idx" ON "public"."scans"("imageId", "startedAt");

-- CreateIndex
CREATE INDEX "scans_status_startedAt_idx" ON "public"."scans"("status", "startedAt");

-- CreateIndex
CREATE INDEX "scan_results_scanId_idx" ON "public"."scan_results"("scanId");

-- CreateIndex
CREATE INDEX "scan_results_scannerId_idx" ON "public"."scan_results"("scannerId");

-- CreateIndex
CREATE INDEX "scan_results_status_idx" ON "public"."scan_results"("status");

-- CreateIndex
CREATE UNIQUE INDEX "scanners_name_key" ON "public"."scanners"("name");

-- CreateIndex
CREATE INDEX "scanners_name_idx" ON "public"."scanners"("name");

-- CreateIndex
CREATE INDEX "scanners_type_idx" ON "public"."scanners"("type");

-- CreateIndex
CREATE INDEX "scanners_isActive_idx" ON "public"."scanners"("isActive");

-- CreateIndex
CREATE INDEX "bulk_scan_batches_status_idx" ON "public"."bulk_scan_batches"("status");

-- CreateIndex
CREATE INDEX "bulk_scan_batches_createdAt_idx" ON "public"."bulk_scan_batches"("createdAt");

-- CreateIndex
CREATE INDEX "bulk_scan_items_batchId_idx" ON "public"."bulk_scan_items"("batchId");

-- CreateIndex
CREATE INDEX "bulk_scan_items_status_idx" ON "public"."bulk_scan_items"("status");

-- CreateIndex
CREATE UNIQUE INDEX "vulnerabilities_cveId_key" ON "public"."vulnerabilities"("cveId");

-- CreateIndex
CREATE INDEX "vulnerabilities_cveId_idx" ON "public"."vulnerabilities"("cveId");

-- CreateIndex
CREATE INDEX "vulnerabilities_severity_idx" ON "public"."vulnerabilities"("severity");

-- CreateIndex
CREATE INDEX "vulnerabilities_cvssScore_idx" ON "public"."vulnerabilities"("cvssScore");

-- CreateIndex
CREATE INDEX "image_vulnerabilities_imageId_idx" ON "public"."image_vulnerabilities"("imageId");

-- CreateIndex
CREATE INDEX "image_vulnerabilities_vulnerabilityId_idx" ON "public"."image_vulnerabilities"("vulnerabilityId");

-- CreateIndex
CREATE INDEX "image_vulnerabilities_status_idx" ON "public"."image_vulnerabilities"("status");

-- CreateIndex
CREATE INDEX "image_vulnerabilities_packageName_idx" ON "public"."image_vulnerabilities"("packageName");

-- CreateIndex
CREATE UNIQUE INDEX "image_vulnerabilities_imageId_vulnerabilityId_packageName_key" ON "public"."image_vulnerabilities"("imageId", "vulnerabilityId", "packageName");

-- CreateIndex
CREATE INDEX "cve_classifications_imageVulnerabilityId_idx" ON "public"."cve_classifications"("imageVulnerabilityId");

-- CreateIndex
CREATE INDEX "cve_classifications_imageId_idx" ON "public"."cve_classifications"("imageId");

-- CreateIndex
CREATE INDEX "cve_classifications_isFalsePositive_idx" ON "public"."cve_classifications"("isFalsePositive");

-- CreateIndex
CREATE INDEX "policy_rules_category_idx" ON "public"."policy_rules"("category");

-- CreateIndex
CREATE INDEX "policy_rules_severity_idx" ON "public"."policy_rules"("severity");

-- CreateIndex
CREATE INDEX "policy_rules_isActive_idx" ON "public"."policy_rules"("isActive");

-- CreateIndex
CREATE INDEX "policy_violations_scanId_idx" ON "public"."policy_violations"("scanId");

-- CreateIndex
CREATE INDEX "policy_violations_policyRuleId_idx" ON "public"."policy_violations"("policyRuleId");

-- CreateIndex
CREATE INDEX "policy_violations_severity_idx" ON "public"."policy_violations"("severity");

-- CreateIndex
CREATE INDEX "policy_violations_detectedAt_idx" ON "public"."policy_violations"("detectedAt");

-- CreateIndex
CREATE INDEX "audit_logs_eventType_idx" ON "public"."audit_logs"("eventType");

-- CreateIndex
CREATE INDEX "audit_logs_category_idx" ON "public"."audit_logs"("category");

-- CreateIndex
CREATE INDEX "audit_logs_userIp_idx" ON "public"."audit_logs"("userIp");

-- CreateIndex
CREATE INDEX "audit_logs_timestamp_idx" ON "public"."audit_logs"("timestamp");

-- CreateIndex
CREATE INDEX "audit_logs_resource_idx" ON "public"."audit_logs"("resource");

-- CreateIndex
CREATE INDEX "repositories_type_idx" ON "public"."repositories"("type");

-- CreateIndex
CREATE INDEX "repositories_status_idx" ON "public"."repositories"("status");

-- CreateIndex
CREATE INDEX "repositories_createdAt_idx" ON "public"."repositories"("createdAt");

-- AddForeignKey
ALTER TABLE "public"."scans" ADD CONSTRAINT "scans_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "public"."images"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."scan_results" ADD CONSTRAINT "scan_results_scannerId_fkey" FOREIGN KEY ("scannerId") REFERENCES "public"."scanners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."scan_results" ADD CONSTRAINT "scan_results_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "public"."scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."bulk_scan_items" ADD CONSTRAINT "bulk_scan_items_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "public"."images"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."bulk_scan_items" ADD CONSTRAINT "bulk_scan_items_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "public"."scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."bulk_scan_items" ADD CONSTRAINT "bulk_scan_items_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "public"."bulk_scan_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."image_vulnerabilities" ADD CONSTRAINT "image_vulnerabilities_vulnerabilityId_fkey" FOREIGN KEY ("vulnerabilityId") REFERENCES "public"."vulnerabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."image_vulnerabilities" ADD CONSTRAINT "image_vulnerabilities_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "public"."images"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."cve_classifications" ADD CONSTRAINT "cve_classifications_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "public"."images"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."cve_classifications" ADD CONSTRAINT "cve_classifications_imageVulnerabilityId_fkey" FOREIGN KEY ("imageVulnerabilityId") REFERENCES "public"."image_vulnerabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."policy_violations" ADD CONSTRAINT "policy_violations_policyRuleId_fkey" FOREIGN KEY ("policyRuleId") REFERENCES "public"."policy_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."policy_violations" ADD CONSTRAINT "policy_violations_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "public"."scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

