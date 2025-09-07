import { promisify } from 'util';
import { exec } from 'child_process';
import { PatchStrategy } from './PatchStrategy';
import { logger } from '@/lib/logger';
import type { PatchResult } from '@/generated/prisma';
import type { PatchableVulnerability } from '../PatchExecutor';

const execAsync = promisify(exec);

export class YumPatchStrategy extends PatchStrategy {
  readonly packageManager = 'yum';

  async applyPatches(
    operationId: string,
    mountPath: string,
    vulnerabilities: PatchableVulnerability[],
    dryRun?: boolean
  ): Promise<PatchResult[]> {
    const results: PatchResult[] = [];
    
    try {
      // Clean YUM cache first
      logger.info('Cleaning YUM cache');
      const cleanCmd = `yum --installroot=${mountPath} clean all`;
      
      if (!dryRun) {
        await execAsync(cleanCmd);
      }

      // Update YUM metadata
      logger.info('Updating YUM metadata');
      const updateCmd = `yum --installroot=${mountPath} makecache`;
      
      if (!dryRun) {
        await execAsync(updateCmd);
      }

      // Process each vulnerability
      for (const vuln of vulnerabilities) {
        let installCmd: string;
        
        if (vuln.fixedVersion && vuln.fixedVersion !== 'unknown') {
          // Install specific version
          installCmd = `yum --installroot=${mountPath} install -y ${this.buildPackageSpec(vuln.packageName, vuln.fixedVersion)}`;
          logger.info(`Installing ${vuln.packageName} version ${vuln.fixedVersion}`);
        } else {
          // Update to latest version
          installCmd = `yum --installroot=${mountPath} update -y ${vuln.packageName}`;
          logger.info(`Updating ${vuln.packageName} to latest version`);
        }
        
        try {
          if (!dryRun) {
            const { stdout, stderr } = await execAsync(installCmd);
            
            // Check if package was actually updated
            if (stdout.includes('Nothing to do') || stdout.includes('No packages marked for update')) {
              logger.warn(`No update available for ${vuln.packageName}`);
              const result = await this.createPatchResult(
                operationId,
                vuln,
                installCmd,
                'SKIPPED',
                'No update available'
              );
              results.push(result);
              continue;
            }
          }
          
          const result = await this.createPatchResult(
            operationId,
            vuln,
            installCmd,
            dryRun ? 'SKIPPED' : 'SUCCESS'
          );
          results.push(result);
          
        } catch (error) {
          logger.error(`Failed to patch ${vuln.packageName}:`, error);
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

      // Clean up YUM cache to reduce image size
      if (!dryRun && results.some(r => r.status === 'SUCCESS')) {
        try {
          await execAsync(`yum --installroot=${mountPath} clean all`);
          await execAsync(`rm -rf ${mountPath}/var/cache/yum`);
          logger.info('Cleaned YUM cache');
        } catch (error) {
          logger.warn('Failed to clean YUM cache:', error);
        }
      }

    } catch (error) {
      logger.error('YUM patch strategy failed:', error);
      
      // Mark all vulnerabilities as failed if we couldn't even start
      for (const vuln of vulnerabilities) {
        const existingResult = results.find(r => r.cveId === vuln.cveId);
        if (!existingResult) {
          const result = await this.createPatchResult(
            operationId,
            vuln,
            'yum update/install',
            'FAILED',
            `Strategy failed: ${error instanceof Error ? error.message : String(error)}`
          );
          results.push(result);
        }
      }
    }

    return results;
  }

  protected buildPackageSpec(packageName: string, version?: string): string {
    if (version && version !== 'unknown') {
      // YUM uses - instead of = for version specification
      return `${packageName}-${version}`;
    }
    return packageName;
  }
}