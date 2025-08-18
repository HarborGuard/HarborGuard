-- AlterTable
ALTER TABLE "bulk_scan_batches" ADD COLUMN "name" TEXT;

-- CreateTable
CREATE TABLE "cve_classifications" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cveId" TEXT NOT NULL,
    "imageId" TEXT NOT NULL,
    "isFalsePositive" BOOLEAN NOT NULL DEFAULT false,
    "comment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdBy" TEXT,
    CONSTRAINT "cve_classifications_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "images" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "cve_classifications_cveId_idx" ON "cve_classifications"("cveId");

-- CreateIndex
CREATE INDEX "cve_classifications_imageId_idx" ON "cve_classifications"("imageId");

-- CreateIndex
CREATE INDEX "cve_classifications_isFalsePositive_idx" ON "cve_classifications"("isFalsePositive");

-- CreateIndex
CREATE UNIQUE INDEX "cve_classifications_cveId_imageId_key" ON "cve_classifications"("cveId", "imageId");
