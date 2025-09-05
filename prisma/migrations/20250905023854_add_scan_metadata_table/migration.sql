-- CreateTable
CREATE TABLE "public"."scan_metadata" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "dockerId" TEXT,
    "dockerOs" TEXT,
    "dockerArchitecture" TEXT,
    "dockerSize" BIGINT,
    "dockerAuthor" TEXT,
    "dockerCreated" TIMESTAMP(3),
    "dockerVersion" TEXT,
    "dockerParent" TEXT,
    "dockerComment" TEXT,
    "dockerDigest" TEXT,
    "dockerConfig" JSONB,
    "dockerRootFS" JSONB,
    "dockerGraphDriver" JSONB,
    "dockerRepoTags" JSONB,
    "dockerRepoDigests" JSONB,
    "dockerMetadata" JSONB,
    "dockerLabels" JSONB,
    "dockerEnv" JSONB,
    "trivyResults" JSONB,
    "grypeResults" JSONB,
    "syftResults" JSONB,
    "dockleResults" JSONB,
    "osvResults" JSONB,
    "diveResults" JSONB,
    "vulnerabilityCritical" INTEGER NOT NULL DEFAULT 0,
    "vulnerabilityHigh" INTEGER NOT NULL DEFAULT 0,
    "vulnerabilityMedium" INTEGER NOT NULL DEFAULT 0,
    "vulnerabilityLow" INTEGER NOT NULL DEFAULT 0,
    "vulnerabilityInfo" INTEGER NOT NULL DEFAULT 0,
    "complianceScore" INTEGER,
    "complianceGrade" TEXT,
    "complianceFatal" INTEGER,
    "complianceWarn" INTEGER,
    "complianceInfo" INTEGER,
    "compliancePass" INTEGER,
    "aggregatedRiskScore" INTEGER,
    "scannerVersions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scan_metadata_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "scan_metadata_scanId_key" ON "public"."scan_metadata"("scanId");

-- CreateIndex
CREATE INDEX "scan_metadata_scanId_idx" ON "public"."scan_metadata"("scanId");

-- CreateIndex
CREATE INDEX "scan_metadata_dockerDigest_idx" ON "public"."scan_metadata"("dockerDigest");

-- CreateIndex
CREATE INDEX "scan_metadata_aggregatedRiskScore_idx" ON "public"."scan_metadata"("aggregatedRiskScore");

-- AddForeignKey
ALTER TABLE "public"."scan_metadata" ADD CONSTRAINT "scan_metadata_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "public"."scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
