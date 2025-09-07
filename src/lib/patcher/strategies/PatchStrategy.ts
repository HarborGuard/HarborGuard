import { prisma } from '@/lib/prisma';
import type { PatchResult } from '@/generated/prisma';
import type { PatchableVulnerability } from '../PatchExecutor';

export abstract class PatchStrategy {
  abstract readonly packageManager: string;

  abstract applyPatches(
    operationId: string,
    mountPath: string,
    vulnerabilities: PatchableVulnerability[],
    dryRun?: boolean
  ): Promise<PatchResult[]>;

  protected async createPatchResult(
    operationId: string,
    vulnerability: PatchableVulnerability,
    command: string,
    status: 'SUCCESS' | 'FAILED' | 'SKIPPED',
    errorMessage?: string
  ): Promise<PatchResult> {
    return await prisma.patchResult.create({
      data: {
        patchOperationId: operationId,
        vulnerabilityId: vulnerability.cveId,
        cveId: vulnerability.cveId,
        packageName: vulnerability.packageName,
        originalVersion: vulnerability.currentVersion,
        targetVersion: vulnerability.fixedVersion,
        patchCommand: command,
        status,
        errorMessage,
        executedAt: status !== 'SKIPPED' ? new Date() : null,
        packageManager: this.packageManager
      }
    });
  }

  protected buildPackageSpec(packageName: string, version?: string): string {
    if (version && version !== 'unknown') {
      return `${packageName}=${version}`;
    }
    return packageName;
  }
}