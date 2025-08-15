import { promisify } from 'util';
import { exec } from 'child_process';
import fs from 'fs/promises';
import { IScannerBase, ScannerResult } from '../types';

const execAsync = promisify(exec);

export class DiveScanner implements IScannerBase {
  readonly name = 'dive';

  async scan(tarPath: string, outputPath: string, env: NodeJS.ProcessEnv): Promise<ScannerResult> {
    try {
      await execAsync(
        `dive --source docker-archive ${tarPath} --json ${outputPath}`,
        { env, timeout: 240000 }
      );
      
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn('Dive scan failed:', errorMessage);
      
      await fs.writeFile(outputPath, JSON.stringify({ 
        error: errorMessage,
        layer: [] 
      }));
      return { success: false, error: errorMessage };
    }
  }

  async getVersion(): Promise<string> {
    try {
      const { stdout } = await execAsync('dive --version');
      return stdout.trim().split('\n')[0];
    } catch (error) {
      return 'unknown';
    }
  }
}