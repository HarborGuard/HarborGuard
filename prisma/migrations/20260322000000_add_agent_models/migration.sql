-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'DISCONNECTED');
CREATE TYPE "AgentJobType" AS ENUM ('SCAN', 'PATCH');
CREATE TYPE "AgentJobStatus" AS ENUM ('PENDING', 'ASSIGNED', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "agents" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "apiKeyHash" TEXT NOT NULL,
    "status" "AgentStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastSeenAt" TIMESTAMP(3),
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hostname" TEXT,
    "os" TEXT,
    "arch" TEXT,
    "sensorVersion" TEXT,
    "scannerVersions" JSONB,
    "capabilities" TEXT[],
    "s3Configured" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_jobs" (
    "id" TEXT NOT NULL,
    "agentId" TEXT,
    "scanId" TEXT,
    "type" "AgentJobType" NOT NULL,
    "status" "AgentJobStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,

    CONSTRAINT "agent_jobs_pkey" PRIMARY KEY ("id")
);

-- AlterTable: add s3Prefix to scan_metadata
ALTER TABLE "scan_metadata" ADD COLUMN IF NOT EXISTS "s3Prefix" TEXT;

-- CreateIndex
CREATE INDEX "agents_apiKeyHash_idx" ON "agents"("apiKeyHash");
CREATE INDEX "agents_status_idx" ON "agents"("status");
CREATE INDEX "agent_jobs_agentId_idx" ON "agent_jobs"("agentId");
CREATE INDEX "agent_jobs_status_idx" ON "agent_jobs"("status");
CREATE INDEX "agent_jobs_agentId_status_idx" ON "agent_jobs"("agentId", "status");
CREATE INDEX "agent_jobs_scanId_idx" ON "agent_jobs"("scanId");

-- AddForeignKey
ALTER TABLE "agent_jobs" ADD CONSTRAINT "agent_jobs_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "agent_jobs" ADD CONSTRAINT "agent_jobs_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "scans"("id") ON DELETE SET NULL ON UPDATE CASCADE;
