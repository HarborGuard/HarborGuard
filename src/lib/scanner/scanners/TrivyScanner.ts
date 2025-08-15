import { promisify } from 'util';
import { exec } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { IScannerBase, ScannerResult } from '../types';

const execAsync = promisify(exec);

export class TrivyScanner implements IScannerBase {
  readonly name = 'trivy';

  async scan(tarPath: string, outputPath: string, env: NodeJS.ProcessEnv): Promise<ScannerResult> {
    try {
      await execAsync(
        `trivy image --input "${tarPath}" -f json -o "${outputPath}"`,
        { env, timeout: 300000 }
      );
      
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn('Trivy scan failed:', errorMessage);
      
      await fs.writeFile(outputPath, JSON.stringify({ error: errorMessage }));
      return { success: false, error: errorMessage };
    }
  }

  async getVersion(): Promise<string> {
    try {
      const { stdout } = await execAsync('trivy --version');
      return stdout.trim().split('\n')[0];
    } catch (error) {
      return 'unknown';
    }
  }
}