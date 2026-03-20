import { promisify } from 'util';
import { exec } from 'child_process';
import fs from 'fs/promises';
import { IScannerBase, ScannerResult } from '../types';

const execAsync = promisify(exec);

export class ScoutScanner implements IScannerBase {
  readonly name = 'scout';

  async scan(tarPath: string, outputPath: string, env: NodeJS.ProcessEnv): Promise<ScannerResult> {
    try {
      await execAsync(
        `docker scout cves --format json --output "${outputPath}" "docker-archive://${tarPath}"`,
        { env, timeout: (parseInt(env.SCAN_TIMEOUT_MINUTES || '30') || 30) * 60 * 1000 }
      );

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn('Scout scan failed:', errorMessage);

      await fs.writeFile(outputPath, JSON.stringify({ error: errorMessage }));
      return { success: false, error: errorMessage };
    }
  }

  async getVersion(): Promise<string> {
    try {
      const { stdout } = await execAsync('docker scout version 2>/dev/null || echo "not installed"');
      const match = stdout.match(/version\s+([\d.]+)/i);
      return match ? match[1] : 'unknown';
    } catch {
      return 'not installed';
    }
  }
}
