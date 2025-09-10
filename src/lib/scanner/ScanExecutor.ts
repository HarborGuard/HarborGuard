import fs from 'fs/promises';
import path from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';
import { exportDockerImage, inspectDockerImage } from '@/lib/docker';
import { IScanExecutor, ScanReports } from './types';
import { AVAILABLE_SCANNERS } from './scanners';
import { prisma } from '@/lib/prisma';
import type { ScanRequest, ScannerConfig } from '@/types';
import { config } from '@/lib/config';
import { logger } from '@/lib/logger';

const execAsync = promisify(exec);

export class ScanExecutor implements IScanExecutor {
  private workDir = process.env.SCANNER_WORKDIR || '/workspace';

  constructor(
    private progressTracker: { updateProgress: (requestId: string, progress: number, step?: string) => void }
  ) {}

  async executeTarScan(requestId: string, request: ScanRequest, scanId: string, imageId: string): Promise<void> {
    const reportDir = path.join(this.workDir, 'reports', requestId);
    const cacheDir = path.join(this.workDir, 'cache');

    await this.setupDirectories(reportDir, cacheDir);
    this.progressTracker.updateProgress(requestId, 10, 'Setting up scan environment');

    const tarPath = request.tarPath!;
    const env = this.setupEnvironmentVariables(cacheDir);

    logger.scanner(`Scanning tar file: ${tarPath}`);

    // Check if tar file exists
    try {
      const stats = await fs.stat(tarPath);
      logger.scanner(`Tar file found: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    } catch (error) {
      throw new Error(`Tar file not found: ${tarPath}`);
    }

    this.progressTracker.updateProgress(requestId, 20, 'Reading tar metadata');

    // Extract metadata from tar
    try {
      const { stdout: metadataOutput } = await execAsync(
        `skopeo inspect docker-archive:${tarPath}`,
        { env }
      );
      await fs.writeFile(path.join(reportDir, 'metadata.json'), metadataOutput);
    } catch (error) {
      logger.warn('Failed to extract tar metadata:', error);
      // Write minimal metadata
      await fs.writeFile(path.join(reportDir, 'metadata.json'), JSON.stringify({
        Architecture: 'unknown',
        Os: 'linux',
        RepoTags: [`${request.image}:${request.tag}`]
      }, null, 2));
    }

    this.progressTracker.updateProgress(requestId, 30, 'Starting security scans');

    await this.runScannersOnTar(requestId, tarPath, reportDir, env, request.scanners);

    // Don't delete the tar file since it's the patched image we want to keep
    logger.scanner('Scan completed, tar file preserved at:', tarPath);
  }

  async executeLocalDockerScan(requestId: string, request: ScanRequest, scanId: string, imageId: string): Promise<void> {
    const reportDir = path.join(this.workDir, 'reports', requestId);
    const imageDir = path.join(this.workDir, 'images');
    const cacheDir = path.join(this.workDir, 'cache');

    await this.setupDirectories(reportDir, cacheDir);
    this.progressTracker.updateProgress(requestId, 10, 'Setting up scan environment');

    const imageName = request.dockerImageId || `${request.image}:${request.tag}`;
    // Replace both slashes and colons to create a safe filename
    const safeImageName = request.image.replace(/[/:]/g, '_');
    const tarPath = path.join(imageDir, `${safeImageName}-${requestId}.tar`);

    const env = this.setupEnvironmentVariables(cacheDir);

    logger.scanner(`Scanning local Docker image ${imageName}`);

    this.progressTracker.updateProgress(requestId, 20, 'Exporting Docker image');
    
    await exportDockerImage(imageName, tarPath);
    this.progressTracker.updateProgress(requestId, 50, 'Image export completed');

    const imageData = await inspectDockerImage(imageName);
    await fs.writeFile(path.join(reportDir, 'metadata.json'), JSON.stringify(imageData, null, 2));

    await this.runScannersOnTar(requestId, tarPath, reportDir, env, request.scanners);

    // Keep tar file for potential patching operations
    logger.scanner('Scan completed, tar file preserved for patching at:', tarPath);
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
    
    // Get authentication arguments for inspect command
    const inspectAuthArgs = await this.getInspectAuthArgs(request.repositoryId, request.image);
    // Add insecure registry flag if needed (for registries without auth)
    const insecureFlag = this.isInsecureRegistry(request.registry) && !request.repositoryId ? '--tls-verify=false ' : '';

    const { stdout: digestOutput } = await execAsync(
      `skopeo inspect ${insecureFlag}${inspectAuthArgs} --format '{{.Digest}}' docker://${imageRef}`,
      { env }
    );
    const digest = digestOutput.trim();
    const imageHash = digest.replace('sha256:', '');
    // Replace both slashes and colons to create a safe filename
    const safeImageName = request.image.replace(/[/:]/g, '_');
    const tarPath = path.join(imageDir, `${safeImageName}-${imageHash}.tar`);

    logger.scanner(`Scanning ${imageRef} (${digest})`);

    // Check if tar file already exists and remove it
    if (await fs.access(tarPath).then(() => true).catch(() => false)) {
      logger.scanner(`Removing existing tar file: ${tarPath}`);
      await fs.unlink(tarPath);
    }

    this.progressTracker.updateProgress(requestId, 1, 'Starting image download');
    
    // Get authentication arguments for copy command
    const copyAuthArgs = await this.getCopyAuthArgs(request.repositoryId, request.image);
    // Add insecure registry flag if needed (for registries without auth)
    const insecureCopyFlag = this.isInsecureRegistry(request.registry) && !request.repositoryId ? '--src-tls-verify=false ' : '';
    
    console.log(`skopeo copy ${insecureCopyFlag}${copyAuthArgs} docker://${imageRef} docker-archive:${tarPath}`);
    await execAsync(`skopeo copy ${insecureCopyFlag}${copyAuthArgs} docker://${imageRef} docker-archive:${tarPath}`, { env });
    
    this.progressTracker.updateProgress(requestId, 50, 'Image download completed');

    const { stdout: metadataOutput } = await execAsync(
      `skopeo inspect docker-archive:${tarPath}`,
      { env }
    );
    await fs.writeFile(path.join(reportDir, 'metadata.json'), metadataOutput);

    await this.runScannersOnTar(requestId, tarPath, reportDir, env, request.scanners);

    // Keep tar file for potential patching operations
    logger.scanner('Scan completed, tar file preserved for patching at:', tarPath);
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
    env: NodeJS.ProcessEnv,
    scannerConfig?: ScannerConfig
  ): Promise<void> {
    this.progressTracker.updateProgress(requestId, 55, 'Starting security scans');

    const progressSteps = [65, 75, 85, 88, 90, 94];
    
    // Filter scanners based on configuration
    let enabledScanners = AVAILABLE_SCANNERS.filter(scanner => 
      config.enabledScanners.includes(scanner.name)
    );
    
    // If scanner config is provided, further filter based on user selection
    if (scannerConfig) {
      enabledScanners = enabledScanners.filter(scanner => {
        // Check if the scanner is explicitly enabled in the config
        const scannerKey = scanner.name as keyof ScannerConfig;
        return scannerConfig[scannerKey] === true;
      });
    }

    logger.scanner(`Running ${enabledScanners.length} enabled scanners: ${enabledScanners.map(s => s.name).join(', ')}`);

    // Create a semaphore to limit concurrent scans
    const concurrentScans = Math.min(config.maxConcurrentScans, enabledScanners.length);
    logger.debug(`Max concurrent scans set to: ${concurrentScans}`);

    const runScannerWithTimeout = async (scanner: typeof AVAILABLE_SCANNERS[0], index: number) => {
      const outputPath = path.join(reportDir, `${scanner.name}.json`);
      
      try {
        logger.debug(`Starting ${scanner.name} scan`);
        
        const scanPromise = scanner.scan(tarPath, outputPath, env);
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`${scanner.name} scan timed out after ${config.scanTimeoutMinutes} minutes`));
          }, config.scanTimeoutMinutes * 60 * 1000);
        });

        const result = await Promise.race([scanPromise, timeoutPromise]);
        
        if (result.success) {
          const progressIndex = Math.min(index, progressSteps.length - 1);
          this.progressTracker.updateProgress(
            requestId, 
            progressSteps[progressIndex], 
            `${scanner.name.charAt(0).toUpperCase() + scanner.name.slice(1)} scan completed`
          );
          logger.scanner(`${scanner.name} scan completed successfully`);
        } else {
          logger.warn(`${scanner.name} scan failed: ${result.error}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.warn(`${scanner.name} scan failed: ${errorMessage}`);
      }
    };

    // Run scanners with concurrency limit
    const batches: Array<Promise<void>[]> = [];
    for (let i = 0; i < enabledScanners.length; i += concurrentScans) {
      const batch = enabledScanners
        .slice(i, i + concurrentScans)
        .map((scanner, batchIndex) => runScannerWithTimeout(scanner, i + batchIndex));
      batches.push(batch);
    }

    // Execute batches sequentially, but scanners within each batch concurrently
    for (const batch of batches) {
      await Promise.all(batch);
    }

    logger.scanner('All enabled scanners completed');
  }

  async loadScanResults(requestId: string): Promise<ScanReports> {
    const reportDir = path.join(this.workDir, 'reports', requestId);
    const reports: ScanReports = {};
    
    const reportFiles = ['trivy.json', 'grype.json', 'syft.json', 'dockle.json', 'osv.json', 'dive.json', 'metadata.json'];
    
    for (const filename of reportFiles) {
      const scannerName = filename.replace('.json', '');

      // Check scanner activation before file read
      if (!config.enabledScanners.includes(scannerName)) {
          logger.debug(`Scanner ${scannerName} not enabled, skipping file ${filename}`);
          continue;
      }

      const filePath = path.join(reportDir, filename);
      try {
        const content = await fs.readFile(filePath, 'utf8');
        const reportName = filename.replace('.json', '') as keyof ScanReports;
        reports[reportName] = JSON.parse(content);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.warn(`Failed to read ${filename}:`, errorMessage);
      }
    }

    return reports;
  }

  /**
   * Check if an image name appears to be a private repository
   */
  private isLikelyPrivateImage(imageName: string): boolean {
    return imageName.includes('/') && !imageName.startsWith('library/');
  }

  /**
   * Check if a registry should use insecure/HTTP connection
   */
  private isInsecureRegistry(registry?: string): boolean {
    if (!registry) return false;
    // Common local/insecure registries
    return registry.startsWith('localhost:') || 
           registry.startsWith('127.0.0.1:') || 
           registry.startsWith('host.docker.internal:');
  }

  /**
   * Find a repository that might contain the given image
   */
  private async findMatchingRepositoryForImage(imageName: string): Promise<string | null> {
    try {
      const repositories = await prisma.repository.findMany({
        where: { status: 'ACTIVE' }
      });

      for (const repo of repositories) {
        if (repo.type === 'DOCKERHUB') {
          const username = repo.organization || repo.username;
          if (username && imageName.startsWith(`${username}/`)) {
            return repo.id;
          }
        } else if (repo.type === 'GHCR' && repo.registryUrl?.includes('ghcr.io')) {
          const username = repo.organization || repo.username;
          if (username && imageName.startsWith(`ghcr.io/${username}/`)) {
            return repo.id;
          }
        } else if (repo.type === 'GENERIC' && repo.registryUrl) {
          const registryHost = repo.registryUrl.replace(/^https?:\/\//, '').split('/')[0];
          if (imageName.startsWith(`${registryHost}/`)) {
            return repo.id;
          }
        }
      }
      return null;
    } catch (error) {
      logger.error('Failed to find matching repository:', error);
      return null;
    }
  }

  /**
   * Get authentication arguments for skopeo inspect commands
   */
  private async getInspectAuthArgs(repositoryId?: string, imageName?: string): Promise<string> {
    let repoId = repositoryId;
    
    // If no repositoryId provided but image appears private, try to find matching repository
    if (!repoId && imageName && this.isLikelyPrivateImage(imageName)) {
      const foundRepoId = await this.findMatchingRepositoryForImage(imageName);
      repoId = foundRepoId || undefined;
    }
    
    if (!repoId) {
      return '--no-creds';
    }

    try {
      const repository = await prisma.repository.findUnique({
        where: { id: repoId },
      });

      if (!repository || repository.status !== 'ACTIVE') {
        logger.warn(`Repository ${repoId} not found or inactive`);
        return '--no-creds';
      }

      const username = repository.username;
      const password = repository.encryptedPassword;
      let authArgs = '';

      // Debug logging
      logger.info(`Repository ${repository.id} protocol: ${repository.protocol}, registryUrl: ${repository.registryUrl}`);

      // Add TLS verification flag for HTTP registries
      if (repository.protocol === 'http') {
        authArgs += '--tls-verify=false ';
        logger.info(`Adding --tls-verify=false for HTTP registry`);
      }

      if (username && password) {
        const escapedUsername = username.replace(/"/g, '\\"');
        const escapedPassword = password.replace(/"/g, '\\"');
        authArgs += `--creds "${escapedUsername}:${escapedPassword}"`;
      } else {
        authArgs += '--no-creds';
      }

      logger.info(`Final auth args for repository ${repository.id}: ${authArgs.trim()}`);
      return authArgs.trim();
    } catch (error) {
      logger.error(`Failed to get authentication for repository ${repoId}:`, error);
      return '--no-creds';
    }
  }

  /**
   * Get authentication arguments for skopeo copy commands
   */
  private async getCopyAuthArgs(repositoryId?: string, imageName?: string): Promise<string> {
    let repoId = repositoryId;
    
    // If no repositoryId provided but image appears private, try to find matching repository
    if (!repoId && imageName && this.isLikelyPrivateImage(imageName)) {
      const foundRepoId = await this.findMatchingRepositoryForImage(imageName);
      repoId = foundRepoId || undefined;
    }
    
    if (!repoId) {
      return '--src-no-creds';
    }

    try {
      const repository = await prisma.repository.findUnique({
        where: { id: repoId },
      });

      if (!repository || repository.status !== 'ACTIVE') {
        logger.warn(`Repository ${repoId} not found or inactive`);
        return '--src-no-creds';
      }

      const username = repository.username;
      const password = repository.encryptedPassword;
      let authArgs = '';

      // Debug logging
      logger.info(`[Copy] Repository ${repository.id} protocol: ${repository.protocol}, registryUrl: ${repository.registryUrl}`);

      // Add TLS verification flag for HTTP registries
      if (repository.protocol === 'http') {
        authArgs += '--src-tls-verify=false ';
        logger.info(`[Copy] Adding --src-tls-verify=false for HTTP registry`);
      }

      if (username && password) {
        const escapedUsername = username.replace(/"/g, '\\"');
        const escapedPassword = password.replace(/"/g, '\\"');
        authArgs += `--src-creds "${escapedUsername}:${escapedPassword}"`;
      } else {
        authArgs += '--src-no-creds';
      }

      logger.info(`[Copy] Final auth args for repository ${repository.id}: ${authArgs.trim()}`);
      return authArgs.trim();
    } catch (error) {
      logger.error(`Failed to get authentication for repository ${repoId}:`, error);
      return '--src-no-creds';
    }
  }
}