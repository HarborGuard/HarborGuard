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
import { RepositoryService } from '@/services/RepositoryService';
import { RegistryProviderFactory } from '@/lib/registry/providers/RegistryProviderFactory';
import type { Repository } from '@/generated/prisma';

const execAsync = promisify(exec);

export class ScanExecutor implements IScanExecutor {
  private workDir = process.env.SCANNER_WORKDIR || '/workspace';
  private repositoryService: RepositoryService;

  constructor(
    private progressTracker: { updateProgress: (requestId: string, progress: number, step?: string) => void }
  ) {
    this.repositoryService = RepositoryService.getInstance(prisma);
  }

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

    // Get registry URL from repository service
    const registryUrl = await this.repositoryService.getRegistryUrl(request.repositoryId, request.image) || request.registry;

    // Parse the image name to handle cases where it already includes the registry
    let cleanImageName = request.image;
    if (registryUrl && cleanImageName.startsWith(registryUrl + '/')) {
      cleanImageName = cleanImageName.substring(registryUrl.length + 1);
    } else if (registryUrl && cleanImageName.startsWith(registryUrl)) {
      cleanImageName = cleanImageName.substring(registryUrl.length);
      if (cleanImageName.startsWith('/')) {
        cleanImageName = cleanImageName.substring(1);
      }
    }
    
    const fullImageName = registryUrl && cleanImageName ? `${registryUrl}/${cleanImageName}` : cleanImageName;
    const imageRef = `${fullImageName}:${request.tag}`;

    const env = this.setupEnvironmentVariables(cacheDir);
    
    // Get repository - required for registry operations
    let repository: Repository | null = null;
    if (request.repositoryId) {
      repository = await prisma.repository.findUnique({
        where: { id: request.repositoryId }
      });
    } else {
      // Try to find a repository for this image
      repository = await this.repositoryService.findForImage(request.image);
    }
    
    if (!repository) {
      // Create a temporary repository based on the registry URL and type hint
      let repoType: 'DOCKERHUB' | 'GHCR' | 'GENERIC' | 'ECR' | 'GCR' = 'DOCKERHUB';
      let repoName = 'Docker Hub';
      let repoUrl = registryUrl || 'docker.io';
      
      // Use registryType hint if provided
      if (request.registryType) {
        if (request.registryType === 'GITLAB') {
          // GitLab uses GENERIC type with special handling
          repoType = 'GENERIC';
          repoName = 'GitLab Container Registry';
        } else {
          repoType = request.registryType as any;
          switch (request.registryType) {
            case 'GHCR':
              // Check if it's public (no auth) or private
              repoName = (!request.repositoryId && !registryUrl) ? 'GHCR Public' : 'GitHub Container Registry';
              break;
            case 'ECR':
              repoName = 'AWS Elastic Container Registry';
              break;
            case 'GCR':
              repoName = 'Google Container Registry';
              break;
            case 'DOCKERHUB':
              repoName = 'Docker Hub Public';
              break;
            default:
              repoName = 'Generic Registry';
          }
        }
      } else {
        // Auto-detect repository type based on registry URL
        if (repoUrl.includes('ghcr.io')) {
          repoType = 'GHCR';
          repoName = 'GHCR Public';
        } else if (repoUrl.includes('gitlab')) {
          repoType = 'GENERIC';
          repoName = 'GitLab Container Registry';
        } else if (repoUrl.includes('ecr')) {
          repoType = 'ECR';
          repoName = 'AWS Elastic Container Registry';
        } else if (repoUrl.includes('gcr.io') || repoUrl.includes('pkg.dev')) {
          repoType = 'GCR';
          repoName = 'Google Container Registry';
        } else if (repoUrl === 'docker.io' || repoUrl === 'registry-1.docker.io') {
          repoType = 'DOCKERHUB';
          repoName = 'Docker Hub Public';
        } else {
          repoType = 'GENERIC';
          repoName = 'Generic Registry';
        }
      }
      
      repository = {
        id: 'temp',
        name: repoName,
        type: repoType,
        protocol: 'https',
        registryUrl: repoUrl,
        username: '',
        encryptedPassword: '',
        organization: null,
        status: 'ACTIVE',
        lastTested: null,
        repositoryCount: null,
        apiVersion: null,
        capabilities: null,
        rateLimits: null,
        healthCheck: null,
        createdAt: new Date(),
        updatedAt: new Date()
      } as Repository;
    }
    
    // Use registry handler for digest - use clean image name without registry prefix
    const provider = RegistryProviderFactory.createFromRepository(repository);
    const digest = await provider.getImageDigest(cleanImageName, request.tag);
    const imageHash = digest.replace('sha256:', '');
    // Replace both slashes and colons to create a safe filename
    const safeImageName = cleanImageName.replace(/[/:]/g, '_');
    const tarPath = path.join(imageDir, `${safeImageName}-${imageHash}.tar`);

    logger.scanner(`Scanning ${imageRef} (${digest})`);

    // Check if tar file already exists and remove it
    if (await fs.access(tarPath).then(() => true).catch(() => false)) {
      logger.scanner(`Removing existing tar file: ${tarPath}`);
      await fs.unlink(tarPath);
    }

    this.progressTracker.updateProgress(requestId, 1, 'Starting image download');
    
    // Pull image using registry handler - use clean image name
    await provider.pullImage(cleanImageName, request.tag, tarPath);
    
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

}