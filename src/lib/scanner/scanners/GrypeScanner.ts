import { promisify } from 'util';
import { exec } from 'child_process';
import fs from 'fs/promises';
import { IScannerBase, ScannerResult } from '../types';

const execAsync = promisify(exec);

export class GrypeScanner implements IScannerBase {
  readonly name = 'grype';

  async scan(tarPath: string, outputPath: string, env: NodeJS.ProcessEnv): Promise<ScannerResult> {
    try {
      await execAsync(
        `grype docker-archive:${tarPath} -o json > "${outputPath}"`,
        { env, shell: '/bin/sh', timeout: 300000 }
      );
      
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn('Grype scan failed:', errorMessage);
      
      await fs.writeFile(outputPath, JSON.stringify({ error: errorMessage }));
      return { success: false, error: errorMessage };
    }
  }

  async getVersion(): Promise<string> {
    try {
      const { stdout } = await execAsync('grype version');
      return stdout.trim().split('\n')[0];
    } catch (error) {
      return 'unknown';
    }
  }
}