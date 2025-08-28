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
      const osvSbomPath = path.join(reportDir, 'osv-sbom.cdx.json');
      
      // Generate SBOM specifically for OSV-scanner (independent of Syft scanner)
      console.log('OSV scanner: Generating independent SBOM...');
      try {
        await execAsync(
          `syft docker-archive:${tarPath} -o cyclonedx-json@1.5 > "${osvSbomPath}"`,
          { env, shell: '/bin/sh', timeout: 300000 }
        );
        console.log('OSV scanner: SBOM generation completed');
      } catch (sbomError) {
        const errorMessage = sbomError instanceof Error ? sbomError.message : String(sbomError);
        console.warn('OSV scanner: Failed to generate SBOM:', errorMessage);
        await fs.writeFile(outputPath, JSON.stringify({ 
          error: `Failed to generate SBOM: ${errorMessage}`,
          vulnerabilities: []
        }));
        return { success: false, error: `Failed to generate SBOM: ${errorMessage}` };
      }

      // Run OSV scanner on the generated SBOM
      console.log('OSV scanner: Running vulnerability scan...');
      try {
        await execAsync(
          `osv-scanner -L "${osvSbomPath}" --verbosity error --format json > "${outputPath}"`,
          { env, shell: '/bin/sh', timeout: 300000, maxBuffer: 10 * 1024 * 1024 * 10 }
        );
      } catch (osvError: any) {
        // OSV scanner exits with code 1 when vulnerabilities are found, which is normal
        try {
          await fs.access(outputPath);
          console.log('OSV scanner: Completed with vulnerabilities found (exit code 1 is normal)');
        } catch {
          throw osvError;
        }
      }
      
      // Clean up the temporary SBOM file
      try {
        await fs.unlink(osvSbomPath);
      } catch (cleanupError) {
        console.warn('OSV scanner: Failed to cleanup temporary SBOM file:', cleanupError);
        // Don't fail the scan for cleanup errors
      }
      
      console.log('OSV scanner: Scan completed successfully');
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