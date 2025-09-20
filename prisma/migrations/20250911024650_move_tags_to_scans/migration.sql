-- AlterTable
ALTER TABLE "public"."scans" ADD COLUMN     "tag" TEXT NOT NULL DEFAULT 'latest';

-- CreateIndex
CREATE INDEX "scans_tag_idx" ON "public"."scans"("tag");

-- CreateIndex
CREATE INDEX "scans_imageId_tag_idx" ON "public"."scans"("imageId", "tag");
