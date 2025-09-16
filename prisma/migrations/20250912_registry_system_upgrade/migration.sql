-- Add primaryRepositoryId to images table
ALTER TABLE "public"."images" ADD COLUMN "primaryRepositoryId" TEXT;

-- Add foreign key constraint
ALTER TABLE "public"."images" ADD CONSTRAINT "images_primaryRepositoryId_fkey" 
  FOREIGN KEY ("primaryRepositoryId") REFERENCES "public"."repositories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add indexes for primaryRepositoryId
CREATE INDEX "images_primaryRepositoryId_idx" ON "public"."images"("primaryRepositoryId");
CREATE INDEX "images_name_tag_primaryRepositoryId_idx" ON "public"."images"("name", "tag", "primaryRepositoryId");

-- Add new repository fields if they don't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'repositories' 
                 AND column_name = 'apiVersion') THEN
    ALTER TABLE "public"."repositories" ADD COLUMN "apiVersion" TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'repositories' 
                 AND column_name = 'capabilities') THEN
    ALTER TABLE "public"."repositories" ADD COLUMN "capabilities" JSONB;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'repositories' 
                 AND column_name = 'rateLimits') THEN
    ALTER TABLE "public"."repositories" ADD COLUMN "rateLimits" JSONB;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'repositories' 
                 AND column_name = 'healthCheck') THEN
    ALTER TABLE "public"."repositories" ADD COLUMN "healthCheck" JSONB;
  END IF;
END $$;

-- Create RepositoryImage table if not exists
CREATE TABLE IF NOT EXISTS "public"."repository_images" (
  "id" TEXT NOT NULL,
  "repositoryId" TEXT NOT NULL,
  "imageId" TEXT NOT NULL,
  "namespace" TEXT,
  "imageName" TEXT NOT NULL,
  "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSynced" TIMESTAMP(3),
  "syncStatus" TEXT NOT NULL DEFAULT 'PENDING',
  
  CONSTRAINT "repository_images_pkey" PRIMARY KEY ("id")
);

-- Add unique constraints if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'repository_images_repositoryId_imageId_key') THEN
    ALTER TABLE "public"."repository_images" ADD CONSTRAINT "repository_images_repositoryId_imageId_key" UNIQUE ("repositoryId", "imageId");
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'repository_images_repositoryId_namespace_imageName_key') THEN
    ALTER TABLE "public"."repository_images" ADD CONSTRAINT "repository_images_repositoryId_namespace_imageName_key" UNIQUE ("repositoryId", "namespace", "imageName");
  END IF;
END $$;

-- Add indexes for RepositoryImage
CREATE INDEX IF NOT EXISTS "repository_images_repositoryId_idx" ON "public"."repository_images"("repositoryId");
CREATE INDEX IF NOT EXISTS "repository_images_imageId_idx" ON "public"."repository_images"("imageId");

-- Add foreign keys for RepositoryImage
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'repository_images_repositoryId_fkey') THEN
    ALTER TABLE "public"."repository_images" ADD CONSTRAINT "repository_images_repositoryId_fkey" 
      FOREIGN KEY ("repositoryId") REFERENCES "public"."repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'repository_images_imageId_fkey') THEN
    ALTER TABLE "public"."repository_images" ADD CONSTRAINT "repository_images_imageId_fkey" 
      FOREIGN KEY ("imageId") REFERENCES "public"."images"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Create RepositoryImageMetadata table if not exists
CREATE TABLE IF NOT EXISTS "public"."repository_image_metadata" (
  "id" TEXT NOT NULL,
  "repositoryId" TEXT NOT NULL,
  "namespace" TEXT,
  "imageName" TEXT NOT NULL,
  "description" TEXT,
  "isPrivate" BOOLEAN NOT NULL DEFAULT false,
  "starCount" INTEGER,
  "pullCount" BIGINT,
  "lastUpdated" TIMESTAMP(3),
  "availableTags" JSONB,
  "cachedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "cacheHit" BOOLEAN NOT NULL DEFAULT false,
  
  CONSTRAINT "repository_image_metadata_pkey" PRIMARY KEY ("id")
);

-- Add unique constraint for metadata
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'repository_image_metadata_repositoryId_namespace_imageName_key') THEN
    ALTER TABLE "public"."repository_image_metadata" ADD CONSTRAINT "repository_image_metadata_repositoryId_namespace_imageName_key" 
      UNIQUE ("repositoryId", "namespace", "imageName");
  END IF;
END $$;

-- Add indexes for metadata
CREATE INDEX IF NOT EXISTS "repository_image_metadata_repositoryId_idx" ON "public"."repository_image_metadata"("repositoryId");
CREATE INDEX IF NOT EXISTS "repository_image_metadata_expiresAt_idx" ON "public"."repository_image_metadata"("expiresAt");

-- Add foreign key for metadata
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'repository_image_metadata_repositoryId_fkey') THEN
    ALTER TABLE "public"."repository_image_metadata" ADD CONSTRAINT "repository_image_metadata_repositoryId_fkey" 
      FOREIGN KEY ("repositoryId") REFERENCES "public"."repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Create SyncStatus enum if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SyncStatus') THEN
    CREATE TYPE "public"."SyncStatus" AS ENUM ('PENDING', 'SYNCING', 'SYNCED', 'FAILED');
  END IF;
END $$;

-- Add unique constraint for repositories if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'repositories_registryUrl_username_key') THEN
    ALTER TABLE "public"."repositories" ADD CONSTRAINT "repositories_registryUrl_username_key" UNIQUE ("registryUrl", "username");
  END IF;
END $$;

-- Add additional indexes for repositories
CREATE INDEX IF NOT EXISTS "repositories_type_status_idx" ON "public"."repositories"("type", "status");
CREATE INDEX IF NOT EXISTS "repositories_registryUrl_idx" ON "public"."repositories"("registryUrl");
CREATE INDEX IF NOT EXISTS "repositories_status_type_idx" ON "public"."repositories"("status", "type");