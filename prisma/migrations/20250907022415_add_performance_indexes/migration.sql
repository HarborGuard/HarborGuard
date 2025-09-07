-- Add composite indexes for faster vulnerability filtering and aggregation

-- Grype vulnerabilities: composite index for faster severity filtering
CREATE INDEX IF NOT EXISTS "grype_vulnerabilities_grypeResultsId_severity_idx" 
ON "public"."grype_vulnerabilities"("grypeResultsId", "severity");

-- Trivy vulnerabilities: composite index for faster severity filtering  
CREATE INDEX IF NOT EXISTS "trivy_vulnerabilities_trivyResultsId_severity_idx"
ON "public"."trivy_vulnerabilities"("trivyResultsId", "severity");

-- OSV vulnerabilities: composite index for faster filtering
CREATE INDEX IF NOT EXISTS "osv_vulnerabilities_osvResultsId_packageName_idx"
ON "public"."osv_vulnerabilities"("osvResultsId", "packageName");

-- Syft packages: composite index for faster type/name filtering
CREATE INDEX IF NOT EXISTS "syft_packages_syftResultsId_type_name_idx"
ON "public"."syft_packages"("syftResultsId", "type", "name");

-- Scan metadata: index for faster aggregated data queries
CREATE INDEX IF NOT EXISTS "scan_metadata_vulnerabilityCritical_vulnerabilityHigh_idx"
ON "public"."scan_metadata"("vulnerabilityCritical", "vulnerabilityHigh");

-- Scans: composite index for status and date filtering
CREATE INDEX IF NOT EXISTS "scans_status_finishedAt_idx"
ON "public"."scans"("status", "finishedAt");

-- Images: composite index for registry and name lookups
CREATE INDEX IF NOT EXISTS "images_registry_name_tag_idx"
ON "public"."images"("registry", "name", "tag");

-- Analyze tables to update statistics for query planner
ANALYZE "public"."grype_vulnerabilities";
ANALYZE "public"."trivy_vulnerabilities";
ANALYZE "public"."osv_vulnerabilities";
ANALYZE "public"."syft_packages";
ANALYZE "public"."scan_metadata";
ANALYZE "public"."scans";
ANALYZE "public"."images";