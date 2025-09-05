/*
  Warnings:

  - You are about to drop the `policy_rules` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `policy_violations` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."policy_violations" DROP CONSTRAINT "policy_violations_policyRuleId_fkey";

-- DropForeignKey
ALTER TABLE "public"."policy_violations" DROP CONSTRAINT "policy_violations_scanId_fkey";

-- DropTable
DROP TABLE "public"."policy_rules";

-- DropTable
DROP TABLE "public"."policy_violations";

-- DropEnum
DROP TYPE "public"."PolicyCategory";
