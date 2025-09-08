import { promisify } from 'util';
import { exec } from 'child_process';
import { PatchStrategy } from './PatchStrategy';
import { logger } from '@/lib/logger';
import type { PatchResult } from '@/generated/prisma';
import type { PatchableVulnerability } from '../PatchExecutor';

const execAsync = promisify(exec);

export class ApkPatchStrategy extends PatchStrategy {
  readonly packageManager = 'apk';

  async applyPatches(
    operationId: string,
    mountPath: string,
    vulnerabilities: PatchableVulnerability[],
    dryRun?: boolean
  ): Promise<PatchResult[]> {
    const results: PatchResult[] = [];
    
    try {
      // Update APK package index
      logger.info('Updating APK package index');
      const updateCmd = `chroot ${mountPath} apk update`;
      
      if (!dryRun) {
        await execAsync(updateCmd);
      }

      // Process each vulnerability
      for (const vuln of vulnerabilities) {
        let installCmd: string;
        
        if (vuln.fixedVersion && vuln.fixedVersion !== 'unknown') {
          // Install specific version
          // APK uses = for exact version or ~= for allowing patch versions
          const versionSpec = this.formatApkVersion(vuln.fixedVersion);
          installCmd = `chroot ${mountPath} apk add --no-cache ${vuln.packageName}${versionSpec}`;
          logger.info(`Installing ${vuln.packageName} version ${vuln.fixedVersion}`);
        } else {
          // Upgrade to latest version
          installCmd = `chroot ${mountPath} apk upgrade --no-cache ${vuln.packageName}`;
          logger.info(`Upgrading ${vuln.packageName} to latest version`);
        }
        
        try {
          if (!dryRun) {
            const { stdout, stderr } = await execAsync(installCmd);
            
            // Check if package was actually updated
            if (stderr.includes('UNTRUSTED') || stderr.includes('WARNING')) {
              logger.warn(`Security warning for ${vuln.packageName}: ${stderr}`);
            }
            
            if (stdout.includes('OK:') || stdout.includes('Upgrading')) {
              // Package was successfully installed/upgraded
              const result = await this.createPatchResult(
                operationId,
                vuln,
                installCmd,
                'SUCCESS'
              );
              results.push(result);
            } else if (stdout.includes('is already installed')) {
              // Package already at target version
              const result = await this.createPatchResult(
                operationId,
                vuln,
                installCmd,
                'SKIPPED',
                'Package already at target version'
              );
              results.push(result);
            } else {
              // Uncertain outcome
              const result = await this.createPatchResult(
                operationId,
                vuln,
                installCmd,
                'SUCCESS'
              );
              results.push(result);
            }
          } else {
            // Dry run mode
            const result = await this.createPatchResult(
              operationId,
              vuln,
              installCmd,
              'SKIPPED'
            );
            results.push(result);
          }
          
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

      // Clean up APK cache (minimal in Alpine, but good practice)
      if (!dryRun && results.some(r => r.status === 'SUCCESS')) {
        try {
          await execAsync(`rm -rf ${mountPath}/var/cache/apk/*`);
          logger.info('Cleaned APK cache');
        } catch (error) {
          logger.warn('Failed to clean APK cache:', error);
        }
      }

    } catch (error) {
      logger.error('APK patch strategy failed:', error);
      
      // Mark all vulnerabilities as failed if we couldn't even start
      for (const vuln of vulnerabilities) {
        const existingResult = results.find(r => r.cveId === vuln.cveId);
        if (!existingResult) {
          const result = await this.createPatchResult(
            operationId,
            vuln,
            'apk update/add',
            'FAILED',
            `Strategy failed: ${error instanceof Error ? error.message : String(error)}`
          );
          results.push(result);
        }
      }
    }

    return results;
  }

  private formatApkVersion(version: string): string {
    // APK version format examples:
    // =1.2.3-r0  - exact version
    // ~=1.2      - allows 1.2.x
    // >1.2.3     - greater than
    
    // If version already has APK operators, use as-is
    if (version.startsWith('=') || version.startsWith('~') || version.startsWith('>')) {
      return version;
    }
    
    // Check if it's an Alpine-style version with -r suffix
    if (version.includes('-r')) {
      return `=${version}`;
    }
    
    // For semantic versions, use exact match
    if (/^\d+\.\d+\.\d+/.test(version)) {
      return `=${version}`;
    }
    
    // For partial versions, allow patch updates
    if (/^\d+\.\d+$/.test(version)) {
      return `~=${version}`;
    }
    
    // Default to exact match
    return `=${version}`;
  }
}