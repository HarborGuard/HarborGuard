/**
 * Bridges the dashboard scan flow to the sensor module.
 *
 * Two execution modes:
 *  - Local sensor: shells out to the sensor CLI bundled in the monolith image
 *  - Agent dispatch: creates an AgentJob for a remote sensor container to pick up
 */
import { promisify } from 'util';
import { exec } from 'child_process';
import fs from 'fs/promises';
import { prisma } from '@/lib/prisma';
import type { ScanRequest } from '@/types';
import { logger } from '@/lib/logger';

const execAsync = promisify(exec);

const SENSOR_CLI = process.env.SENSOR_CLI_PATH || '/app/sensor/dist/index.js';

interface ScanEnvelope {
  version: string;
  sensor: { version: string; scannerVersions: Record<string, string> };
  image: { ref: string; digest?: string; name: string; tag: string; platform?: string; sizeBytes?: number };
  scan: { id: string; startedAt: string; finishedAt: string; status: string };
  findings: {
    vulnerabilities: any[];
    packages: any[];
    compliance: any[];
    efficiency: any[];
  };
  aggregates: {
    vulnerabilityCounts: { critical: number; high: number; medium: number; low: number; info: number };
    riskScore: number;
    complianceScore?: number;
    complianceGrade?: string;
    totalPackages: number;
  };
  artifacts?: { s3Prefix?: string; rawResults?: Record<string, string>; sbom?: string };
}

function mapSeverityToEnum(severity: string): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO' {
  const upper = severity?.toUpperCase();
  if (['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'].includes(upper)) return upper as any;
  return 'INFO';
}

// -------------------------------------------------------------------------
// Detection
// -------------------------------------------------------------------------

export async function isSensorAvailableLocally(): Promise<boolean> {
  try {
    await fs.access(SENSOR_CLI);
    return true;
  } catch {
    return false;
  }
}

export async function hasRegisteredAgents(): Promise<boolean> {
  const count = await prisma.agent.count({
    where: { status: { in: ['ACTIVE', 'DISCONNECTED'] } },
  });
  return count > 0;
}

export type ScanMode = 'local-sensor' | 'agent-dispatch' | 'legacy';

export async function detectScanMode(): Promise<ScanMode> {
  if (await hasRegisteredAgents()) return 'agent-dispatch';
  if (await isSensorAvailableLocally()) return 'local-sensor';
  return 'legacy';
}

// -------------------------------------------------------------------------
// Local sensor execution (monolith mode)
// -------------------------------------------------------------------------

export async function executeScanViaSensor(
  scanId: string,
  request: ScanRequest,
  onProgress?: (pct: number, step: string) => void,
): Promise<ScanEnvelope> {
  const imageRef = request.source === 'tar' && request.tarPath
    ? request.tarPath
    : `${request.image}:${request.tag}`;

  const sourceFlag = request.source === 'tar'
    ? 'tar'
    : request.source === 'local'
      ? 'docker'
      : 'registry';

  const scannersList = request.scanners
    ? Object.entries(request.scanners)
        .filter(([, v]) => v === true)
        .map(([k]) => k)
        .join(',')
    : undefined;

  const args = [
    'scan', imageRef,
    '--source', sourceFlag,
    '--output', 'json',
  ];
  if (scannersList) {
    args.push('--scanners', scannersList);
  }

  const cmd = `node "${SENSOR_CLI}" ${args.map(a => `"${a}"`).join(' ')}`;

  onProgress?.(30, 'Running sensor scan');
  logger.info(`[SensorBridge] Executing: ${cmd}`);

  try {
    const { stdout, stderr } = await execAsync(cmd, {
      timeout: 30 * 60 * 1000,
      maxBuffer: 100 * 1024 * 1024,
      env: { ...process.env },
    });

    if (stderr) {
      logger.debug(`[SensorBridge] stderr: ${stderr.slice(0, 500)}`);
    }

    onProgress?.(85, 'Processing scan results');

    const envelope: ScanEnvelope = JSON.parse(stdout);
    return envelope;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`[SensorBridge] Sensor scan failed: ${msg}`);
    throw new Error(`Sensor scan failed: ${msg}`);
  }
}

// -------------------------------------------------------------------------
// Agent dispatch (distributed mode)
// -------------------------------------------------------------------------

export async function dispatchScanToAgent(
  scanId: string,
  request: ScanRequest,
): Promise<{ jobId: string }> {
  const sourceType = request.source === 'tar' ? 'tar'
    : request.source === 'local' ? 'docker'
    : 'registry';

  const payload: any = {
    scan: {
      imageRef: `${request.image}:${request.tag}`,
      source: sourceType,
      ...(request.tarPath && { tarPath: request.tarPath }),
      ...(request.scanners && {
        scanners: Object.entries(request.scanners)
          .filter(([, v]) => v === true)
          .map(([k]) => k),
      }),
    },
  };

  const job = await prisma.agentJob.create({
    data: {
      type: 'scan',
      status: 'PENDING',
      payload,
    },
  });

  logger.info(`[SensorBridge] Dispatched scan job ${job.id} for ${request.image}:${request.tag}`);
  return { jobId: job.id };
}

// -------------------------------------------------------------------------
// Ingest envelope into database (shared by local + upload paths)
// -------------------------------------------------------------------------

export async function ingestEnvelope(
  scanId: string,
  envelope: ScanEnvelope,
): Promise<void> {
  // Update scan record with results from envelope
  await prisma.scan.update({
    where: { id: scanId },
    data: {
      status: envelope.scan.status === 'FAILED' ? 'FAILED' : envelope.scan.status === 'PARTIAL' ? 'PARTIAL' : 'SUCCESS',
      riskScore: envelope.aggregates.riskScore,
      finishedAt: new Date(envelope.scan.finishedAt),
    },
  });

  // Create or update metadata
  const existingMetadataId = (await prisma.scan.findUnique({ where: { id: scanId }, select: { metadataId: true } }))?.metadataId;

  const metadataData = {
    vulnerabilityCritical: envelope.aggregates.vulnerabilityCounts.critical,
    vulnerabilityHigh: envelope.aggregates.vulnerabilityCounts.high,
    vulnerabilityMedium: envelope.aggregates.vulnerabilityCounts.medium,
    vulnerabilityLow: envelope.aggregates.vulnerabilityCounts.low,
    vulnerabilityInfo: envelope.aggregates.vulnerabilityCounts.info,
    aggregatedRiskScore: envelope.aggregates.riskScore,
    complianceScore: envelope.aggregates.complianceScore ?? null,
    complianceGrade: envelope.aggregates.complianceGrade ?? null,
    scannerVersions: envelope.sensor.scannerVersions ?? undefined,
    s3Prefix: envelope.artifacts?.s3Prefix ?? null,
  };

  if (existingMetadataId) {
    await prisma.scanMetadata.update({
      where: { id: existingMetadataId },
      data: metadataData,
    });
  } else {
    const metadata = await prisma.scanMetadata.create({ data: metadataData });
    await prisma.scan.update({ where: { id: scanId }, data: { metadataId: metadata.id } });
  }

  // Insert normalized findings
  const findings = envelope.findings;

  if (findings.vulnerabilities?.length > 0) {
    await prisma.scanVulnerabilityFinding.createMany({
      data: findings.vulnerabilities.map((v: any) => ({
        scanId,
        source: v.source,
        cveId: v.cveId,
        packageName: v.packageName,
        installedVersion: v.installedVersion ?? null,
        fixedVersion: v.fixedVersion ?? null,
        severity: mapSeverityToEnum(v.severity),
        cvssScore: v.cvssScore ?? null,
        title: v.title ?? null,
        description: v.description ?? null,
        vulnerabilityUrl: v.vulnerabilityUrl ?? null,
      })),
    });
  }

  if (findings.packages?.length > 0) {
    await prisma.scanPackageFinding.createMany({
      data: findings.packages.map((p: any) => ({
        scanId,
        source: p.source,
        packageName: p.name,
        version: p.version ?? null,
        type: p.type || 'unknown',
        purl: p.purl ?? null,
        license: p.license ?? null,
      })),
    });
  }

  if (findings.compliance?.length > 0) {
    await prisma.scanComplianceFinding.createMany({
      data: findings.compliance.map((c: any) => ({
        scanId,
        source: c.source,
        ruleId: c.ruleId,
        ruleName: c.ruleName,
        category: c.category || 'General',
        severity: mapSeverityToEnum(c.severity),
        message: c.message || '',
      })),
    });
  }

  if (findings.efficiency?.length > 0) {
    await prisma.scanEfficiencyFinding.createMany({
      data: findings.efficiency.map((e: any) => ({
        scanId,
        source: e.source,
        findingType: e.findingType,
        severity: e.severity || 'INFO',
        sizeBytes: e.sizeBytes ? BigInt(e.sizeBytes) : null,
        description: e.details || e.title || '',
      })),
    });
  }
}
