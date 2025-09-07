-- CreateTable
CREATE TABLE "public"."grype_results" (
    "id" TEXT NOT NULL,
    "scanMetadataId" TEXT NOT NULL,
    "matchesCount" INTEGER NOT NULL DEFAULT 0,
    "dbStatus" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grype_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."grype_vulnerabilities" (
    "id" TEXT NOT NULL,
    "grypeResultsId" TEXT NOT NULL,
    "vulnerabilityId" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "namespace" TEXT,
    "packageName" TEXT NOT NULL,
    "packageVersion" TEXT NOT NULL,
    "packageType" TEXT NOT NULL,
    "packagePath" TEXT,
    "packageLanguage" TEXT,
    "fixState" TEXT,
    "fixVersions" JSONB,
    "cvssV2Score" DOUBLE PRECISION,
    "cvssV2Vector" TEXT,
    "cvssV3Score" DOUBLE PRECISION,
    "cvssV3Vector" TEXT,
    "urls" JSONB,
    "description" TEXT,

    CONSTRAINT "grype_vulnerabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."trivy_results" (
    "id" TEXT NOT NULL,
    "scanMetadataId" TEXT NOT NULL,
    "schemaVersion" INTEGER,
    "artifactName" TEXT,
    "artifactType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trivy_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."trivy_vulnerabilities" (
    "id" TEXT NOT NULL,
    "trivyResultsId" TEXT NOT NULL,
    "targetName" TEXT NOT NULL,
    "targetClass" TEXT,
    "targetType" TEXT,
    "vulnerabilityId" TEXT NOT NULL,
    "pkgId" TEXT,
    "pkgName" TEXT NOT NULL,
    "pkgPath" TEXT,
    "installedVersion" TEXT,
    "fixedVersion" TEXT,
    "status" TEXT,
    "severity" TEXT NOT NULL,
    "severitySource" TEXT,
    "primaryUrl" TEXT,
    "cvssScore" DOUBLE PRECISION,
    "cvssVector" TEXT,
    "cvssScoreV3" DOUBLE PRECISION,
    "cvssVectorV3" TEXT,
    "title" TEXT,
    "description" TEXT,
    "publishedDate" TIMESTAMP(3),
    "lastModifiedDate" TIMESTAMP(3),
    "references" JSONB,

    CONSTRAINT "trivy_vulnerabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."trivy_misconfigurations" (
    "id" TEXT NOT NULL,
    "trivyResultsId" TEXT NOT NULL,
    "targetName" TEXT NOT NULL,
    "targetClass" TEXT,
    "targetType" TEXT,
    "checkId" TEXT NOT NULL,
    "avdId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "namespace" TEXT,
    "query" TEXT,
    "severity" TEXT NOT NULL,
    "resolution" TEXT,
    "status" TEXT NOT NULL,
    "startLine" INTEGER,
    "endLine" INTEGER,
    "code" JSONB,
    "primaryUrl" TEXT,
    "references" JSONB,

    CONSTRAINT "trivy_misconfigurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."trivy_secrets" (
    "id" TEXT NOT NULL,
    "trivyResultsId" TEXT NOT NULL,
    "targetName" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startLine" INTEGER NOT NULL,
    "endLine" INTEGER NOT NULL,
    "code" JSONB,
    "match" TEXT,
    "layer" TEXT,

    CONSTRAINT "trivy_secrets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."dive_results" (
    "id" TEXT NOT NULL,
    "scanMetadataId" TEXT NOT NULL,
    "efficiencyScore" DOUBLE PRECISION NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "wastedBytes" BIGINT NOT NULL,
    "wastedPercent" DOUBLE PRECISION NOT NULL,
    "inefficientFiles" JSONB,
    "duplicateFiles" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dive_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."dive_layers" (
    "id" TEXT NOT NULL,
    "diveResultsId" TEXT NOT NULL,
    "layerId" TEXT NOT NULL,
    "layerIndex" INTEGER NOT NULL,
    "digest" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "command" TEXT,
    "addedFiles" INTEGER NOT NULL DEFAULT 0,
    "modifiedFiles" INTEGER NOT NULL DEFAULT 0,
    "removedFiles" INTEGER NOT NULL DEFAULT 0,
    "wastedBytes" BIGINT NOT NULL DEFAULT 0,
    "fileDetails" JSONB,

    CONSTRAINT "dive_layers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."syft_results" (
    "id" TEXT NOT NULL,
    "scanMetadataId" TEXT NOT NULL,
    "schemaVersion" TEXT,
    "bomFormat" TEXT,
    "specVersion" TEXT,
    "serialNumber" TEXT,
    "packagesCount" INTEGER NOT NULL DEFAULT 0,
    "filesAnalyzed" INTEGER NOT NULL DEFAULT 0,
    "source" JSONB,
    "distro" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "syft_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."syft_packages" (
    "id" TEXT NOT NULL,
    "syftResultsId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "foundBy" TEXT,
    "purl" TEXT,
    "cpe" TEXT,
    "language" TEXT,
    "licenses" JSONB,
    "size" BIGINT,
    "locations" JSONB,
    "layerId" TEXT,
    "metadata" JSONB,

    CONSTRAINT "syft_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."dockle_results" (
    "id" TEXT NOT NULL,
    "scanMetadataId" TEXT NOT NULL,
    "summary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dockle_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."dockle_violations" (
    "id" TEXT NOT NULL,
    "dockleResultsId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "alerts" JSONB,

    CONSTRAINT "dockle_violations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."osv_results" (
    "id" TEXT NOT NULL,
    "scanMetadataId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "osv_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."osv_vulnerabilities" (
    "id" TEXT NOT NULL,
    "osvResultsId" TEXT NOT NULL,
    "osvId" TEXT NOT NULL,
    "aliases" JSONB,
    "packageName" TEXT NOT NULL,
    "packageEcosystem" TEXT NOT NULL,
    "packageVersion" TEXT NOT NULL,
    "packagePurl" TEXT,
    "summary" TEXT,
    "details" TEXT,
    "severity" JSONB,
    "fixed" TEXT,
    "affected" JSONB,
    "published" TIMESTAMP(3),
    "modified" TIMESTAMP(3),
    "withdrawn" TIMESTAMP(3),
    "references" JSONB,
    "databaseSpecific" JSONB,

    CONSTRAINT "osv_vulnerabilities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "grype_results_scanMetadataId_key" ON "public"."grype_results"("scanMetadataId");

-- CreateIndex
CREATE INDEX "grype_results_scanMetadataId_idx" ON "public"."grype_results"("scanMetadataId");

-- CreateIndex
CREATE INDEX "grype_vulnerabilities_grypeResultsId_idx" ON "public"."grype_vulnerabilities"("grypeResultsId");

-- CreateIndex
CREATE INDEX "grype_vulnerabilities_vulnerabilityId_idx" ON "public"."grype_vulnerabilities"("vulnerabilityId");

-- CreateIndex
CREATE INDEX "grype_vulnerabilities_severity_idx" ON "public"."grype_vulnerabilities"("severity");

-- CreateIndex
CREATE INDEX "grype_vulnerabilities_packageName_idx" ON "public"."grype_vulnerabilities"("packageName");

-- CreateIndex
CREATE UNIQUE INDEX "trivy_results_scanMetadataId_key" ON "public"."trivy_results"("scanMetadataId");

-- CreateIndex
CREATE INDEX "trivy_results_scanMetadataId_idx" ON "public"."trivy_results"("scanMetadataId");

-- CreateIndex
CREATE INDEX "trivy_vulnerabilities_trivyResultsId_idx" ON "public"."trivy_vulnerabilities"("trivyResultsId");

-- CreateIndex
CREATE INDEX "trivy_vulnerabilities_vulnerabilityId_idx" ON "public"."trivy_vulnerabilities"("vulnerabilityId");

-- CreateIndex
CREATE INDEX "trivy_vulnerabilities_severity_idx" ON "public"."trivy_vulnerabilities"("severity");

-- CreateIndex
CREATE INDEX "trivy_vulnerabilities_pkgName_idx" ON "public"."trivy_vulnerabilities"("pkgName");

-- CreateIndex
CREATE INDEX "trivy_vulnerabilities_targetName_idx" ON "public"."trivy_vulnerabilities"("targetName");

-- CreateIndex
CREATE INDEX "trivy_misconfigurations_trivyResultsId_idx" ON "public"."trivy_misconfigurations"("trivyResultsId");

-- CreateIndex
CREATE INDEX "trivy_misconfigurations_checkId_idx" ON "public"."trivy_misconfigurations"("checkId");

-- CreateIndex
CREATE INDEX "trivy_misconfigurations_severity_idx" ON "public"."trivy_misconfigurations"("severity");

-- CreateIndex
CREATE INDEX "trivy_misconfigurations_status_idx" ON "public"."trivy_misconfigurations"("status");

-- CreateIndex
CREATE INDEX "trivy_secrets_trivyResultsId_idx" ON "public"."trivy_secrets"("trivyResultsId");

-- CreateIndex
CREATE INDEX "trivy_secrets_ruleId_idx" ON "public"."trivy_secrets"("ruleId");

-- CreateIndex
CREATE INDEX "trivy_secrets_severity_idx" ON "public"."trivy_secrets"("severity");

-- CreateIndex
CREATE UNIQUE INDEX "dive_results_scanMetadataId_key" ON "public"."dive_results"("scanMetadataId");

-- CreateIndex
CREATE INDEX "dive_results_scanMetadataId_idx" ON "public"."dive_results"("scanMetadataId");

-- CreateIndex
CREATE INDEX "dive_results_efficiencyScore_idx" ON "public"."dive_results"("efficiencyScore");

-- CreateIndex
CREATE INDEX "dive_layers_diveResultsId_idx" ON "public"."dive_layers"("diveResultsId");

-- CreateIndex
CREATE INDEX "dive_layers_layerIndex_idx" ON "public"."dive_layers"("layerIndex");

-- CreateIndex
CREATE UNIQUE INDEX "syft_results_scanMetadataId_key" ON "public"."syft_results"("scanMetadataId");

-- CreateIndex
CREATE INDEX "syft_results_scanMetadataId_idx" ON "public"."syft_results"("scanMetadataId");

-- CreateIndex
CREATE INDEX "syft_packages_syftResultsId_idx" ON "public"."syft_packages"("syftResultsId");

-- CreateIndex
CREATE INDEX "syft_packages_name_idx" ON "public"."syft_packages"("name");

-- CreateIndex
CREATE INDEX "syft_packages_type_idx" ON "public"."syft_packages"("type");

-- CreateIndex
CREATE INDEX "syft_packages_purl_idx" ON "public"."syft_packages"("purl");

-- CreateIndex
CREATE UNIQUE INDEX "dockle_results_scanMetadataId_key" ON "public"."dockle_results"("scanMetadataId");

-- CreateIndex
CREATE INDEX "dockle_results_scanMetadataId_idx" ON "public"."dockle_results"("scanMetadataId");

-- CreateIndex
CREATE INDEX "dockle_violations_dockleResultsId_idx" ON "public"."dockle_violations"("dockleResultsId");

-- CreateIndex
CREATE INDEX "dockle_violations_code_idx" ON "public"."dockle_violations"("code");

-- CreateIndex
CREATE INDEX "dockle_violations_level_idx" ON "public"."dockle_violations"("level");

-- CreateIndex
CREATE UNIQUE INDEX "osv_results_scanMetadataId_key" ON "public"."osv_results"("scanMetadataId");

-- CreateIndex
CREATE INDEX "osv_results_scanMetadataId_idx" ON "public"."osv_results"("scanMetadataId");

-- CreateIndex
CREATE INDEX "osv_vulnerabilities_osvResultsId_idx" ON "public"."osv_vulnerabilities"("osvResultsId");

-- CreateIndex
CREATE INDEX "osv_vulnerabilities_osvId_idx" ON "public"."osv_vulnerabilities"("osvId");

-- CreateIndex
CREATE INDEX "osv_vulnerabilities_packageName_idx" ON "public"."osv_vulnerabilities"("packageName");

-- AddForeignKey
ALTER TABLE "public"."grype_results" ADD CONSTRAINT "grype_results_scanMetadataId_fkey" FOREIGN KEY ("scanMetadataId") REFERENCES "public"."scan_metadata"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."grype_vulnerabilities" ADD CONSTRAINT "grype_vulnerabilities_grypeResultsId_fkey" FOREIGN KEY ("grypeResultsId") REFERENCES "public"."grype_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."trivy_results" ADD CONSTRAINT "trivy_results_scanMetadataId_fkey" FOREIGN KEY ("scanMetadataId") REFERENCES "public"."scan_metadata"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."trivy_vulnerabilities" ADD CONSTRAINT "trivy_vulnerabilities_trivyResultsId_fkey" FOREIGN KEY ("trivyResultsId") REFERENCES "public"."trivy_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."trivy_misconfigurations" ADD CONSTRAINT "trivy_misconfigurations_trivyResultsId_fkey" FOREIGN KEY ("trivyResultsId") REFERENCES "public"."trivy_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."trivy_secrets" ADD CONSTRAINT "trivy_secrets_trivyResultsId_fkey" FOREIGN KEY ("trivyResultsId") REFERENCES "public"."trivy_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."dive_results" ADD CONSTRAINT "dive_results_scanMetadataId_fkey" FOREIGN KEY ("scanMetadataId") REFERENCES "public"."scan_metadata"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."dive_layers" ADD CONSTRAINT "dive_layers_diveResultsId_fkey" FOREIGN KEY ("diveResultsId") REFERENCES "public"."dive_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."syft_results" ADD CONSTRAINT "syft_results_scanMetadataId_fkey" FOREIGN KEY ("scanMetadataId") REFERENCES "public"."scan_metadata"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."syft_packages" ADD CONSTRAINT "syft_packages_syftResultsId_fkey" FOREIGN KEY ("syftResultsId") REFERENCES "public"."syft_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."dockle_results" ADD CONSTRAINT "dockle_results_scanMetadataId_fkey" FOREIGN KEY ("scanMetadataId") REFERENCES "public"."scan_metadata"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."dockle_violations" ADD CONSTRAINT "dockle_violations_dockleResultsId_fkey" FOREIGN KEY ("dockleResultsId") REFERENCES "public"."dockle_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."osv_results" ADD CONSTRAINT "osv_results_scanMetadataId_fkey" FOREIGN KEY ("scanMetadataId") REFERENCES "public"."scan_metadata"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."osv_vulnerabilities" ADD CONSTRAINT "osv_vulnerabilities_osvResultsId_fkey" FOREIGN KEY ("osvResultsId") REFERENCES "public"."osv_results"("id") ON DELETE CASCADE ON UPDATE CASCADE;
