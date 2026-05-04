-- Add isIgnored and ignoreReason to cve_classifications so the user can mark
-- a vulnerability as accepted-risk (distinct from "false positive" / scanner
-- error). The default vulnerability list filters these out client-side. See
-- HarborGuard issue #154.

ALTER TABLE "cve_classifications"
  ADD COLUMN "isIgnored"    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "ignoreReason" TEXT;

CREATE INDEX "cve_classifications_isIgnored_idx" ON "cve_classifications"("isIgnored");
