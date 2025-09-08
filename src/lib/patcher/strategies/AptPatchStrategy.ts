import { promisify } from 'util';
import { exec } from 'child_process';
import { PatchStrategy } from './PatchStrategy';
import { logger } from '@/lib/logger';
import type { PatchResult } from '@/generated/prisma';
import type { PatchableVulnerability } from '../PatchExecutor';

const execAsync = promisify(exec);

export class AptPatchStrategy extends PatchStrategy {
  readonly packageManager = 'apt';

  async applyPatches(
    operationId: string,
    mountPath: string,
    vulnerabilities: PatchableVulnerability[],
    dryRun?: boolean
  ): Promise<PatchResult[]> {
    const results: PatchResult[] = [];
    
    try {
      // Update package lists first
      logger.info('Updating APT package lists');
      const updateCmd = `chroot ${mountPath} apt-get update`;
      
      if (!dryRun) {
        await execAsync(updateCmd, { 
          env: { ...process.env, DEBIAN_FRONTEND: 'noninteractive' }
        });
      }

      // Group packages by whether they have specific versions
      const packagesToUpgrade: string[] = [];
      const packagesWithVersions: Map<string, string> = new Map();

      for (const vuln of vulnerabilities) {
        if (vuln.fixedVersion && vuln.fixedVersion !== 'unknown') {
          packagesWithVersions.set(vuln.packageName, vuln.fixedVersion);
        } else {
          packagesToUpgrade.push(vuln.packageName);
        }
      }

      // Apply upgrades for packages without specific versions
      if (packagesToUpgrade.length > 0) {
        const upgradeCmd = `chroot ${mountPath} apt-get install -y --only-upgrade ${packagesToUpgrade.join(' ')}`;
        logger.info(`Upgrading packages: ${packagesToUpgrade.join(', ')}`);

        for (const packageName of packagesToUpgrade) {
          const vuln = vulnerabilities.find(v => v.packageName === packageName)!;
          
          try {
            if (!dryRun) {
              await execAsync(upgradeCmd, {
                env: { ...process.env, DEBIAN_FRONTEND: 'noninteractive' }
              });
            }
            
            const result = await this.createPatchResult(
              operationId,
              vuln,
              upgradeCmd,
              dryRun ? 'SKIPPED' : 'SUCCESS'
            );
            results.push(result);
          } catch (error) {
            logger.error(`Failed to upgrade ${packageName}:`, error);
            const result = await this.createPatchResult(
              operationId,
              vuln,
              upgradeCmd,
              'FAILED',
              error instanceof Error ? error.message : String(error)
            );
            results.push(result);
          }
        }
      }

      // Install specific versions
      for (const [packageName, version] of packagesWithVersions) {
        const vuln = vulnerabilities.find(v => v.packageName === packageName)!;
        const installCmd = `chroot ${mountPath} apt-get install -y ${this.buildPackageSpec(packageName, version)}`;
        
        logger.info(`Installing ${packageName} version ${version}`);
        
        try {
          if (!dryRun) {
            await execAsync(installCmd, {
              env: { ...process.env, DEBIAN_FRONTEND: 'noninteractive' }
            });
          }
          
          const result = await this.createPatchResult(
            operationId,
            vuln,
            installCmd,
            dryRun ? 'SKIPPED' : 'SUCCESS'
          );
          results.push(result);
        } catch (error) {
          logger.error(`Failed to install ${packageName}=${version}:`, error);
          const result = await this.createPatchResult(
            operationId,
            vuln,
            installCmd,
            'FAILED',
            error instanceof Error ? error.message : String(error)
          );
          results.push(result);
        }
      }

      // Clean up APT cache to reduce image size
      if (!dryRun && results.some(r => r.status === 'SUCCESS')) {
        try {
          await execAsync(`chroot ${mountPath} apt-get clean`);
          await execAsync(`chroot ${mountPath} rm -rf /var/lib/apt/lists/*`);
          logger.info('Cleaned APT cache');
        } catch (error) {
          logger.warn('Failed to clean APT cache:', error);
        }
      }

    } catch (error) {
      logger.error('APT patch strategy failed:', error);
      
      // Mark all vulnerabilities as failed if we couldn't even start
      for (const vuln of vulnerabilities) {
        const existingResult = results.find(r => r.cveId === vuln.cveId);
        if (!existingResult) {
          const result = await this.createPatchResult(
            operationId,
            vuln,
            'apt-get update/install',
            'FAILED',
            `Strategy failed: ${error instanceof Error ? error.message : String(error)}`
          );
          results.push(result);
        }
      }
    }

    return results;
  }
}