import { promisify } from 'util';
import { exec } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { IScannerBase, ScannerResult } from '../types';

const execAsync = promisify(exec);

export class OSVScanner implements IScannerBase {
  readonly name = 'osv';

  async scan(tarPath: string, outputPath: string, env: NodeJS.ProcessEnv): Promise<ScannerResult> {
    try {
      const reportDir = path.dirname(outputPath);
      const sbomPath = path.join(reportDir, 'sbom.cdx.json');
      
      try {
        await fs.access(sbomPath);
      } catch {
        await fs.writeFile(outputPath, JSON.stringify({ 
          error: 'SBOM file not found - Syft must run first',
          vulnerabilities: []
        }));
        return { success: false, error: 'SBOM file not found' };
      }

      try {
        await execAsync(
          `osv-scanner -L "${sbomPath}" --verbosity error --format json > "${outputPath}"`,
          { env, shell: '/bin/sh', timeout: 300000, maxBuffer: 10 * 1024 * 1024 * 10 }
        );
      } catch (osvError: any) {
        try {
          await fs.access(outputPath);
          console.log('OSV scanner completed with vulnerabilities found (exit code 1 is normal)');
        } catch {
          throw osvError;
        }
      }
      
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn('OSV scan failed:', errorMessage);
      
      await fs.writeFile(outputPath, JSON.stringify({ 
        error: errorMessage,
        vulnerabilities: []
      }));
      return { success: false, error: errorMessage };
    }
  }

  async getVersion(): Promise<string> {
    try {
      const { stdout } = await execAsync('osv-scanner --version');
      return stdout.trim().split('\n')[0];
    } catch (error) {
      return 'unknown';
    }
  }
}