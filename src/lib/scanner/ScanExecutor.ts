import fs from 'fs/promises';
import path from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';
import { exportDockerImage, inspectDockerImage } from '@/lib/docker';
import { IScanExecutor, ScanReports } from './types';
import { AVAILABLE_SCANNERS } from './scanners';
import type { ScanRequest } from '@/types';

const execAsync = promisify(exec);

export class ScanExecutor implements IScanExecutor {
  private workDir = process.env.SCANNER_WORKDIR || '/workspace';

  constructor(
    private progressTracker: { updateProgress: (requestId: string, progress: number, step?: string) => void },
    private isDevelopmentMode = process.env.NODE_ENV === 'development' && process.platform === 'win32'
  ) {}

  async executeLocalDockerScan(requestId: string, request: ScanRequest, scanId: string, imageId: string): Promise<void> {
    const reportDir = path.join(this.workDir, 'reports', requestId);
    const imageDir = path.join(this.workDir, 'images');
    const cacheDir = path.join(this.workDir, 'cache');

    await this.setupDirectories(reportDir, cacheDir);
    this.progressTracker.updateProgress(requestId, 10, 'Setting up scan environment');

    const imageName = request.dockerImageId!;
    const safeImageName = request.image.replace(/\//g, '_');
    const tarPath = path.join(imageDir, `${safeImageName}-${requestId}.tar`);

    const env = this.setupEnvironmentVariables(cacheDir);

    console.log(`Scanning local Docker image ${imageName}`);

    this.progressTracker.updateProgress(requestId, 20, 'Exporting Docker image');
    
    await exportDockerImage(imageName, tarPath);
    this.progressTracker.updateProgress(requestId, 50, 'Image export completed');

    const imageData = await inspectDockerImage(imageName);
    await fs.writeFile(path.join(reportDir, 'metadata.json'), JSON.stringify(imageData, null, 2));

    await this.runScannersOnTar(requestId, tarPath, reportDir, env);

    try {
      await fs.unlink(tarPath);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn('Failed to cleanup tar file:', errorMessage);
    }
  }

  async executeRegistryScan(requestId: string, request: ScanRequest, scanId: string, imageId: string): Promise<void> {
    const reportDir = path.join(this.workDir, 'reports', requestId);
    const imageDir = path.join(this.workDir, 'images');
    const cacheDir = path.join(this.workDir, 'cache');

    await this.setupDirectories(reportDir, cacheDir);
    this.progressTracker.updateProgress(requestId, 10, 'Setting up scan environment');

    const fullImageName = request.registry ? `${request.registry}/${request.image}` : request.image;
    const imageRef = `${fullImageName}:${request.tag}`;

    const env = this.setupEnvironmentVariables(cacheDir);

    const { stdout: digestOutput } = await execAsync(
      `skopeo inspect --format '{{.Digest}}' docker://${imageRef}`,
      { env }
    );
    const digest = digestOutput.trim();
    const imageHash = digest.replace('sha256:', '');
    const safeImageName = request.image.replace(/\//g, '_');
    const tarPath = path.join(imageDir, `${safeImageName}-${imageHash}.tar`);

    console.log(`Scanning ${imageRef} (${digest})`);

    this.progressTracker.updateProgress(requestId, 1, 'Starting image download');
    
    console.log(`skopeo copy docker://${imageRef} docker-archive:${tarPath}`);
    await execAsync(`skopeo copy docker://${imageRef} docker-archive:${tarPath}`, { env });
    
    this.progressTracker.updateProgress(requestId, 50, 'Image download completed');

    const { stdout: metadataOutput } = await execAsync(
      `skopeo inspect docker-archive:${tarPath}`,
      { env }
    );
    await fs.writeFile(path.join(reportDir, 'metadata.json'), metadataOutput);

    await this.runScannersOnTar(requestId, tarPath, reportDir, env);

    try {
      await fs.unlink(tarPath);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn('Failed to cleanup tar file:', errorMessage);
    }
  }

  async executeMockScan(requestId: string, request: ScanRequest, scanId: string, imageId: string): Promise<void> {
    console.log(`Development mode: mocking scan for ${request.image}:${request.tag}`);
    
    this.progressTracker.updateProgress(requestId, 25, 'Preparing mock scan data');
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    this.progressTracker.updateProgress(requestId, 50, 'Running vulnerability analysis');
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    this.progressTracker.updateProgress(requestId, 75, 'Generating compliance report');
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    this.progressTracker.updateProgress(requestId, 95, 'Finalizing mock scan');
  }

  private async setupDirectories(reportDir: string, cacheDir: string): Promise<void> {
    await fs.mkdir(reportDir, { recursive: true });
    await fs.mkdir(path.join(this.workDir, 'images'), { recursive: true });
    await fs.mkdir(path.join(cacheDir, 'trivy'), { recursive: true });
    await fs.mkdir(path.join(cacheDir, 'grype'), { recursive: true });
    await fs.mkdir(path.join(cacheDir, 'syft'), { recursive: true });
    await fs.mkdir(path.join(cacheDir, 'dockle'), { recursive: true });
  }

  private setupEnvironmentVariables(cacheDir: string): NodeJS.ProcessEnv {
    return {
      ...process.env,
      TRIVY_CACHE_DIR: path.join(cacheDir, 'trivy'),
      GRYPE_DB_CACHE_DIR: path.join(cacheDir, 'grype'),
      SYFT_CACHE_DIR: path.join(cacheDir, 'syft'),
      DOCKLE_TMP_DIR: path.join(cacheDir, 'dockle'),
    };
  }

  private async runScannersOnTar(
    requestId: string,
    tarPath: string,
    reportDir: string,
    env: NodeJS.ProcessEnv
  ): Promise<void> {
    this.progressTracker.updateProgress(requestId, 55, 'Starting security scans');

    const progressSteps = [65, 75, 85, 88, 90, 94];
    const scannerNames = ['trivy', 'grype', 'syft', 'osv', 'dockle', 'dive'];

    for (let i = 0; i < AVAILABLE_SCANNERS.length; i++) {
      const scanner = AVAILABLE_SCANNERS[i];
      const outputPath = path.join(reportDir, `${scanner.name}.json`);
      
      try {
        const result = await scanner.scan(tarPath, outputPath, env);
        if (result.success) {
          this.progressTracker.updateProgress(
            requestId, 
            progressSteps[i], 
            `${scanner.name.charAt(0).toUpperCase() + scanner.name.slice(1)} scan completed`
          );
        }
      } catch (error) {
        console.warn(`${scanner.name} scan failed:`, error);
      }
    }
  }

  async loadScanResults(requestId: string): Promise<ScanReports> {
    const reportDir = path.join(this.workDir, 'reports', requestId);
    const reports: ScanReports = {};
    
    const reportFiles = ['trivy.json', 'grype.json', 'syft.json', 'dockle.json', 'osv.json', 'dive.json', 'metadata.json'];
    
    for (const filename of reportFiles) {
      const filePath = path.join(reportDir, filename);
      try {
        const content = await fs.readFile(filePath, 'utf8');
        const reportName = filename.replace('.json', '') as keyof ScanReports;
        reports[reportName] = JSON.parse(content);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`Failed to read ${filename}:`, errorMessage);
      }
    }

    return reports;
  }
}