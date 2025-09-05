-- CreateTable
CREATE TABLE "public"."scan_vulnerability_findings" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "cveId" TEXT NOT NULL,
    "packageName" TEXT NOT NULL,
    "installedVersion" TEXT,
    "fixedVersion" TEXT,
    "severity" "public"."Severity" NOT NULL,
    "cvssScore" DOUBLE PRECISION,
    "dataSource" TEXT,
    "vulnerabilityUrl" TEXT,
    "title" TEXT,
    "description" TEXT,
    "publishedDate" TIMESTAMP(3),
    "lastModified" TIMESTAMP(3),
    "filePath" TEXT,
    "layerId" TEXT,
    "packageType" TEXT,
    "rawFinding" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scan_vulnerability_findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."scan_package_findings" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "packageName" TEXT NOT NULL,
    "version" TEXT,
    "type" TEXT NOT NULL,
    "purl" TEXT,
    "license" TEXT,
    "vendor" TEXT,
    "publisher" TEXT,
    "ecosystem" TEXT,
    "language" TEXT,
    "filePath" TEXT,
    "layerId" TEXT,
    "installedSize" BIGINT,
    "metadata" JSONB,
    "dependencies" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scan_package_findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."scan_compliance_findings" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "ruleName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" "public"."Severity" NOT NULL,
    "message" TEXT NOT NULL,
    "description" TEXT,
    "remediation" TEXT,
    "filePath" TEXT,
    "lineNumber" INTEGER,
    "code" TEXT,
    "rawFinding" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scan_compliance_findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."scan_efficiency_findings" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "findingType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "layerId" TEXT,
    "layerIndex" INTEGER,
    "layerCommand" TEXT,
    "sizeBytes" BIGINT,
    "wastedBytes" BIGINT,
    "efficiencyScore" DOUBLE PRECISION,
    "description" TEXT NOT NULL,
    "filePaths" JSONB,
    "rawFinding" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scan_efficiency_findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."scan_finding_correlations" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "findingType" TEXT NOT NULL,
    "correlationKey" TEXT NOT NULL,
    "sources" JSONB NOT NULL,
    "sourceCount" INTEGER NOT NULL,
    "confidenceScore" DOUBLE PRECISION NOT NULL,
    "severity" "public"."Severity",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scan_finding_correlations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scan_vulnerability_findings_scanId_idx" ON "public"."scan_vulnerability_findings"("scanId");

-- CreateIndex
CREATE INDEX "scan_vulnerability_findings_cveId_idx" ON "public"."scan_vulnerability_findings"("cveId");

-- CreateIndex
CREATE INDEX "scan_vulnerability_findings_source_idx" ON "public"."scan_vulnerability_findings"("source");

-- CreateIndex
CREATE INDEX "scan_vulnerability_findings_severity_idx" ON "public"."scan_vulnerability_findings"("severity");

-- CreateIndex
CREATE INDEX "scan_vulnerability_findings_packageName_idx" ON "public"."scan_vulnerability_findings"("packageName");

-- CreateIndex
CREATE INDEX "scan_vulnerability_findings_scanId_cveId_source_idx" ON "public"."scan_vulnerability_findings"("scanId", "cveId", "source");

-- CreateIndex
CREATE INDEX "scan_package_findings_scanId_idx" ON "public"."scan_package_findings"("scanId");

-- CreateIndex
CREATE INDEX "scan_package_findings_packageName_idx" ON "public"."scan_package_findings"("packageName");

-- CreateIndex
CREATE INDEX "scan_package_findings_source_idx" ON "public"."scan_package_findings"("source");

-- CreateIndex
CREATE INDEX "scan_package_findings_type_idx" ON "public"."scan_package_findings"("type");

-- CreateIndex
CREATE INDEX "scan_package_findings_ecosystem_idx" ON "public"."scan_package_findings"("ecosystem");

-- CreateIndex
CREATE INDEX "scan_compliance_findings_scanId_idx" ON "public"."scan_compliance_findings"("scanId");

-- CreateIndex
CREATE INDEX "scan_compliance_findings_ruleId_idx" ON "public"."scan_compliance_findings"("ruleId");

-- CreateIndex
CREATE INDEX "scan_compliance_findings_source_idx" ON "public"."scan_compliance_findings"("source");

-- CreateIndex
CREATE INDEX "scan_compliance_findings_severity_idx" ON "public"."scan_compliance_findings"("severity");

-- CreateIndex
CREATE INDEX "scan_compliance_findings_category_idx" ON "public"."scan_compliance_findings"("category");

-- CreateIndex
CREATE INDEX "scan_efficiency_findings_scanId_idx" ON "public"."scan_efficiency_findings"("scanId");

-- CreateIndex
CREATE INDEX "scan_efficiency_findings_findingType_idx" ON "public"."scan_efficiency_findings"("findingType");

-- CreateIndex
CREATE INDEX "scan_efficiency_findings_source_idx" ON "public"."scan_efficiency_findings"("source");

-- CreateIndex
CREATE INDEX "scan_efficiency_findings_layerId_idx" ON "public"."scan_efficiency_findings"("layerId");

-- CreateIndex
CREATE INDEX "scan_finding_correlations_scanId_idx" ON "public"."scan_finding_correlations"("scanId");

-- CreateIndex
CREATE INDEX "scan_finding_correlations_correlationKey_idx" ON "public"."scan_finding_correlations"("correlationKey");

-- CreateIndex
CREATE INDEX "scan_finding_correlations_sourceCount_idx" ON "public"."scan_finding_correlations"("sourceCount");

-- CreateIndex
CREATE UNIQUE INDEX "scan_finding_correlations_scanId_findingType_correlationKey_key" ON "public"."scan_finding_correlations"("scanId", "findingType", "correlationKey");

-- AddForeignKey
ALTER TABLE "public"."scan_vulnerability_findings" ADD CONSTRAINT "scan_vulnerability_findings_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "public"."scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."scan_package_findings" ADD CONSTRAINT "scan_package_findings_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "public"."scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."scan_compliance_findings" ADD CONSTRAINT "scan_compliance_findings_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "public"."scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."scan_efficiency_findings" ADD CONSTRAINT "scan_efficiency_findings_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "public"."scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."scan_finding_correlations" ADD CONSTRAINT "scan_finding_correlations_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "public"."scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
