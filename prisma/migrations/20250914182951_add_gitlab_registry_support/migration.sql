-- AlterEnum
ALTER TYPE "public"."RepositoryType" ADD VALUE 'GITLAB';

-- AlterTable
ALTER TABLE "public"."repositories" ADD COLUMN     "authUrl" TEXT,
ADD COLUMN     "groupId" TEXT;
