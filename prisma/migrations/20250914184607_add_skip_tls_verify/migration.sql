-- AlterTable
ALTER TABLE "public"."repositories" ADD COLUMN     "skipTlsVerify" BOOLEAN NOT NULL DEFAULT false;
