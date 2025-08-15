import { promisify } from 'util';
import { exec } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { IScannerBase, ScannerResult } from '../types';

const execAsync = promisify(exec);

export class SyftScanner implements IScannerBase {
  readonly name = 'syft';

  async scan(tarPath: string, outputPath: string, env: NodeJS.ProcessEnv): Promise<ScannerResult> {
    try {
      const reportDir = path.dirname(outputPath);
      const sbomPath = path.join(reportDir, 'sbom.cdx.json');
      
      await execAsync(
        `syft docker-archive:${tarPath} -o json > "${outputPath}"`,
        { env, shell: '/bin/sh', timeout: 300000 }
      );
      
      await execAsync(
        `syft docker-archive:${tarPath} -o cyclonedx-json@1.5 > "${sbomPath}"`,
        { env, shell: '/bin/sh', timeout: 300000 }
      );
      
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn('Syft scan failed:', errorMessage);
      
      await fs.writeFile(outputPath, JSON.stringify({ error: errorMessage }));
      return { success: false, error: errorMessage };
    }
  }

  async getVersion(): Promise<string> {
    try {
      const { stdout } = await execAsync('syft version');
      return stdout.trim().split('\n')[0];
    } catch (error) {
      return 'unknown';
    }
  }
}