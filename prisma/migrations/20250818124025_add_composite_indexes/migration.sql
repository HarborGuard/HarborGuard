-- CreateIndex
CREATE INDEX "scans_imageId_status_idx" ON "scans"("imageId", "status");

-- CreateIndex
CREATE INDEX "scans_imageId_startedAt_idx" ON "scans"("imageId", "startedAt");

-- CreateIndex
CREATE INDEX "scans_status_startedAt_idx" ON "scans"("status", "startedAt");
