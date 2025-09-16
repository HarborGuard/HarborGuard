import { promisify } from 'util';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { PatchStrategy } from './strategies/PatchStrategy';
import { AptPatchStrategy } from './strategies/AptPatchStrategy';
import { YumPatchStrategy } from './strategies/YumPatchStrategy';
import { ApkPatchStrategy } from './strategies/ApkPatchStrategy';
import type { 
  PatchOperation, 
  PatchOperationStatus, 
  PatchResult,
  PatchStrategy as PatchStrategyType 
} from '@/generated/prisma';

const execAsync = promisify(exec);

export interface PatchRequest {
  sourceImageId: string;
  scanId: string;
  targetRegistry?: string;
  targetTag?: string;
  dryRun?: boolean;
  selectedVulnerabilityIds?: string[];
}

export interface PatchableVulnerability {
  cveId: string;
  packageName: string;
  currentVersion: string;
  fixedVersion: string;
  packageManager: string;
}

export class PatchExecutorTar {
  private strategies: Map<string, PatchStrategy>;
  private workDir = process.env.SCANNER_WORKDIR || '/workspace';
  private patchDir = path.join(this.workDir, 'patches');

  constructor() {
    this.strategies = new Map<string, PatchStrategy>([
      ['apt', new AptPatchStrategy()],
      ['yum', new YumPatchStrategy()],
      ['apk', new ApkPatchStrategy()],
    ]);
  }

  async executePatch(request: PatchRequest): Promise<PatchOperation> {
    logger.info(`Starting tar-based patch operation for image ${request.sourceImageId}`);
    
    // Create patch operation record
    const patchOperation = await this.createPatchOperation(request);
    
    try {
      // Update status to analyzing
      await this.updatePatchOperationStatus(patchOperation.id, 'ANALYZING');
      
      // Get image and scan details
      const image = await prisma.image.findUnique({
        where: { id: request.sourceImageId },
        include: {
          scans: {
            where: { id: request.scanId },
            include: {
              vulnerabilityFindings: true
            }
          }
        }
      });

      if (!image) {
        throw new Error(`Image ${request.sourceImageId} not found`);
      }

      const scan = image.scans[0];
      if (!scan) {
        throw new Error(`Scan ${request.scanId} not found`);
      }

      // Analyze vulnerabilities for patchability
      let patchableVulns = await this.analyzePatchableVulnerabilities(
        scan.vulnerabilityFindings
      );
      
      // Filter by selected vulnerability IDs if provided
      if (request.selectedVulnerabilityIds && request.selectedVulnerabilityIds.length > 0) {
        patchableVulns = patchableVulns.filter(vuln => 
          request.selectedVulnerabilityIds!.includes(
            scan.vulnerabilityFindings.find(f => 
              f.cveId === vuln.cveId && f.packageName === vuln.packageName
            )?.id || ''
          )
        );
        logger.info(`Filtered to ${patchableVulns.length} selected vulnerabilities from ${request.selectedVulnerabilityIds.length} IDs`);
      }

      if (patchableVulns.length === 0) {
        logger.info('No patchable vulnerabilities found');
        await this.updatePatchOperationStatus(patchOperation.id, 'COMPLETED', {
          vulnerabilitiesCount: 0,
          patchedCount: 0,
          failedCount: 0
        });
        return patchOperation;
      }

      // Update vulnerability count
      await prisma.patchOperation.update({
        where: { id: patchOperation.id },
        data: { vulnerabilitiesCount: patchableVulns.length }
      });

      // Get or download the original tar file
      const originalTarPath = await this.getImageTar(image, scan.requestId);
      
      // Create working directory for this patch operation
      const patchWorkDir = path.join(this.patchDir, patchOperation.id);
      await fs.mkdir(patchWorkDir, { recursive: true });
      
      // Copy tar to working directory
      const workingTarPath = path.join(patchWorkDir, 'image.tar');
      await fs.copyFile(originalTarPath, workingTarPath);
      
      // Update status to building
      await this.updatePatchOperationStatus(patchOperation.id, 'BUILDING');
      
      // Import tar into Buildah
      const containerId = await this.importTarToBuildah(workingTarPath);
      
      // Mount container filesystem
      const mountPath = await this.mountContainer(containerId);
      
      // Update buildah details
      await prisma.patchOperation.update({
        where: { id: patchOperation.id },
        data: {
          buildahContainerId: containerId,
          buildahMountPath: mountPath
        }
      });

      // Update status to patching
      await this.updatePatchOperationStatus(patchOperation.id, 'PATCHING');
      
      // Apply patches
      const patchResults = await this.applyPatches(
        patchOperation.id,
        mountPath,
        patchableVulns,
        request.dryRun
      );

      // Calculate results
      const successCount = patchResults.filter(r => r.status === 'SUCCESS').length;
      const failedCount = patchResults.filter(r => r.status === 'FAILED').length;

      // Export patched image if not dry run
      let patchedImageId: string | null = null;
      let patchedTarPath: string | null = null;
      
      if (!request.dryRun && successCount > 0) {
        await this.updatePatchOperationStatus(patchOperation.id, 'PUSHING');
        
        // Commit the container
        const patchedImageRef = await this.commitContainer(
          containerId,
          image,
          request.targetTag
        );
        
        // Export to tar
        patchedTarPath = path.join(patchWorkDir, 'patched-image.tar');
        await this.exportToTar(patchedImageRef, patchedTarPath);
        
        // If target registry specified, push to registry
        if (request.targetRegistry) {
          await this.pushToRegistry(
            patchedTarPath,
            request.targetRegistry,
            image.name,
            request.targetTag || `${image.tag}-patched`
          );
        }
        
        // Create new image record for patched version
        const patchedImage = await this.createPatchedImageRecord(
          image,
          patchedImageRef,
          patchOperation.id
        );
        
        patchedImageId = patchedImage.id;
        
        // Move patched tar to reports directory for download
        const reportsDir = path.join(this.workDir, 'reports', scan.requestId);
        await fs.copyFile(patchedTarPath, path.join(reportsDir, 'patched-image.tar'));
      }

      // Cleanup
      await this.cleanupContainer(containerId);

      // Update final status
      await this.updatePatchOperationStatus(patchOperation.id, 'COMPLETED', {
        patchedCount: successCount,
        failedCount: failedCount,
        patchedImageId: patchedImageId,
        completedAt: new Date()
      });

      // Save patch summary to reports directory
      if (!request.dryRun) {
        await this.savePatchReport(scan.requestId, patchOperation.id, patchResults);
      }

      return await prisma.patchOperation.findUniqueOrThrow({
        where: { id: patchOperation.id },
        include: { patchResults: true }
      });

    } catch (error) {
      logger.error('Patch operation failed:', error);
      await this.updatePatchOperationStatus(patchOperation.id, 'FAILED', {
        errorMessage: error instanceof Error ? error.message : String(error),
        completedAt: new Date()
      });
      throw error;
    }
  }

  private async getImageTar(image: any, requestId: string): Promise<string> {
    // Check if tar already exists from scan
    const imageDir = path.join(this.workDir, 'images');
    const safeImageName = image.name.replace(/[/:]/g, '_');
    const tarPath = path.join(imageDir, `${safeImageName}-${requestId}.tar`);
    
    try {
      const stats = await fs.stat(tarPath);
      if (stats.size > 0) {
        logger.info(`Using existing tar file: ${tarPath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
        return tarPath;
      } else {
        logger.info(`Tar file exists but is empty, will re-export`);
      }
    } catch {
      logger.info(`Tar file not found at ${tarPath}`);
    }

    // Export from Docker if local source, otherwise download from registry
    if (image.source === 'LOCAL_DOCKER' || image.registry === 'local') {
      logger.info(`Exporting local Docker image ${image.name}:${image.tag} to tar`);
      
      // Use docker save for local images
      await execAsync(`docker save -o ${tarPath} ${image.name}:${image.tag}`);
      
      const stats = await fs.stat(tarPath);
      logger.info(`Exported tar file: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    } else {
      // Download from registry using skopeo
      logger.info(`Downloading image ${image.name}:${image.tag} from registry`);
      
      const fullImageName = image.registry ? `${image.registry}/${image.name}` : image.name;
      const imageRef = `${fullImageName}:${image.tag}`;
      
      await execAsync(
        `skopeo copy --src-tls-verify=false docker://${imageRef} docker-archive:${tarPath}`
      );
    }
    
    return tarPath;
  }

  private async importTarToBuildah(tarPath: string): Promise<string> {
    logger.info(`Importing tar ${tarPath} into Buildah`);
    
    // Use buildah unshare to import in the proper namespace
    const scriptPath = path.join(process.cwd(), 'scripts', 'buildah-patch.sh');
    const { stdout } = await execAsync(`bash ${scriptPath} mount ${tarPath}`);
    
    // Parse container ID and mount path from output
    const [containerId, mountPath] = stdout.trim().split('|');
    
    if (!containerId || !mountPath) {
      throw new Error('Failed to import and mount container');
    }
    
    logger.info(`Imported as container: ${containerId}`);
    logger.info(`Mounted at: ${mountPath}`);
    
    // Store mount path for later use
    this.currentMountPath = mountPath;
    
    return containerId;
  }

  private async mountContainer(containerId: string): Promise<string> {
    // Mount is already done in importTarToBuildah when using unshare
    if (this.currentMountPath) {
      return this.currentMountPath;
    }
    
    // Fallback to regular mount (shouldn't happen with new flow)
    logger.info(`Mounting container ${containerId}`);
    const { stdout } = await execAsync(`buildah --storage-driver vfs mount ${containerId}`);
    const mountPath = stdout.trim();
    logger.info(`Mounted at: ${mountPath}`);
    return mountPath;
  }

  private currentMountPath?: string;

  private async applyPatches(
    operationId: string,
    mountPath: string,
    vulnerabilities: PatchableVulnerability[],
    dryRun?: boolean
  ): Promise<PatchResult[]> {
    const results: PatchResult[] = [];
    
    // Group vulnerabilities by package manager
    const grouped = new Map<string, PatchableVulnerability[]>();
    for (const vuln of vulnerabilities) {
      if (!grouped.has(vuln.packageManager)) {
        grouped.set(vuln.packageManager, []);
      }
      grouped.get(vuln.packageManager)!.push(vuln);
    }
    
    // Apply patches for each package manager
    for (const [packageManager, vulns] of grouped) {
      const strategy = this.strategies.get(packageManager);
      if (!strategy) {
        logger.warn(`No strategy found for package manager: ${packageManager}`);
        continue;
      }
      
      const strategyResults = await strategy.applyPatches(
        operationId,
        mountPath,
        vulns,
        dryRun
      );
      
      results.push(...strategyResults);
    }
    
    return results;
  }

  private async commitContainer(
    containerId: string,
    originalImage: any,
    targetTag?: string
  ): Promise<string> {
    const tag = targetTag || `${originalImage.tag}-patched`;
    const imageName = `${originalImage.name}:${tag}`;
    
    logger.info(`Committing patched container as ${imageName}`);
    await execAsync(`buildah --storage-driver vfs commit ${containerId} ${imageName}`);
    
    return imageName;
  }

  private async exportToTar(imageRef: string, outputPath: string): Promise<void> {
    logger.info(`Exporting patched image ${imageRef} to ${outputPath}`);
    await execAsync(`buildah --storage-driver vfs push ${imageRef} docker-archive:${outputPath}`);
    
    // Get file size
    const stats = await fs.stat(outputPath);
    logger.info(`Exported patched image tar: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  }

  private async pushToRegistry(
    tarPath: string,
    registry: string,
    imageName: string,
    tag: string
  ): Promise<void> {
    const fullImageRef = `${registry}/${imageName}:${tag}`;
    logger.info(`Pushing patched image to ${fullImageRef}`);
    
    // Use skopeo to push from tar to registry
    await execAsync(
      `skopeo copy --dest-tls-verify=false docker-archive:${tarPath} docker://${fullImageRef}`
    );
  }

  private async savePatchReport(
    requestId: string,
    operationId: string,
    patchResults: PatchResult[]
  ): Promise<void> {
    const reportDir = path.join(this.workDir, 'reports', requestId);
    const reportPath = path.join(reportDir, 'patch-report.json');
    
    const report = {
      operationId,
      timestamp: new Date().toISOString(),
      summary: {
        total: patchResults.length,
        success: patchResults.filter(r => r.status === 'SUCCESS').length,
        failed: patchResults.filter(r => r.status === 'FAILED').length,
        skipped: patchResults.filter(r => r.status === 'SKIPPED').length,
      },
      results: patchResults.map(r => ({
        cveId: r.cveId,
        packageName: r.packageName,
        originalVersion: r.originalVersion,
        targetVersion: r.targetVersion,
        status: r.status,
        packageManager: r.packageManager,
        errorMessage: r.errorMessage
      }))
    };
    
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    logger.info(`Saved patch report to ${reportPath}`);
  }

  private async createPatchOperation(request: PatchRequest): Promise<PatchOperation> {
    const image = await prisma.image.findUnique({
      where: { id: request.sourceImageId }
    });

    const strategy = await this.detectPatchStrategy(image!);

    return await prisma.patchOperation.create({
      data: {
        sourceImageId: request.sourceImageId,
        scanId: request.scanId,
        status: 'PENDING',
        strategy: strategy,
        startedAt: new Date()
      }
    });
  }

  private async detectPatchStrategy(image: any): Promise<PatchStrategyType> {
    const imageName = image.name.toLowerCase();
    
    if (imageName.includes('ubuntu') || imageName.includes('debian')) {
      return 'APT';
    } else if (imageName.includes('centos') || imageName.includes('rhel') || imageName.includes('fedora')) {
      return 'YUM';
    } else if (imageName.includes('alpine')) {
      return 'APK';
    } else {
      return 'MULTI';
    }
  }

  private async updatePatchOperationStatus(
    id: string, 
    status: PatchOperationStatus,
    additionalData?: any
  ): Promise<void> {
    await prisma.patchOperation.update({
      where: { id },
      data: {
        status,
        ...additionalData
      }
    });
  }

  private async analyzePatchableVulnerabilities(
    findings: any[]
  ): Promise<PatchableVulnerability[]> {
    const patchable: PatchableVulnerability[] = [];
    
    for (const finding of findings) {
      if (finding.fixedVersion && finding.packageName) {
        const packageManager = this.detectPackageManager(finding.packageType);
        
        if (packageManager && this.strategies.has(packageManager)) {
          patchable.push({
            cveId: finding.cveId,
            packageName: finding.packageName,
            currentVersion: finding.installedVersion || 'unknown',
            fixedVersion: finding.fixedVersion,
            packageManager
          });
        }
      }
    }
    
    return patchable;
  }

  private detectPackageManager(packageType?: string): string | null {
    if (!packageType) return null;
    
    const typeToManager: Record<string, string> = {
      'deb': 'apt',
      'debian': 'apt',
      'ubuntu': 'apt',
      'rpm': 'yum',
      'rhel': 'yum',
      'centos': 'yum',
      'apk': 'apk',
      'alpine': 'apk'
    };
    
    return typeToManager[packageType.toLowerCase()] || null;
  }

  private async createPatchedImageRecord(
    originalImage: any,
    patchedImageRef: string,
    operationId: string
  ): Promise<any> {
    const [name, tag] = patchedImageRef.split(':');
    
    // Generate a unique digest for the patched image
    const digest = `sha256:patched-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    
    const patchedImage = await prisma.image.create({
      data: {
        name,
        tag,
        source: 'REGISTRY',
        digest,
        platform: originalImage.platform,
        sizeBytes: originalImage.sizeBytes
      }
    });
    
    await prisma.patchedImage.create({
      data: {
        originalImageId: originalImage.id,
        patchedImageId: patchedImage.id,
        patchOperationId: operationId,
        originalCveCount: 0,
        remainingCveCount: 0,
        patchedCveCount: 0,
        patchEfficiency: 0.0
      }
    });
    
    return patchedImage;
  }

  private async cleanupContainer(containerId: string): Promise<void> {
    try {
      logger.info(`Cleaning up container ${containerId}`);
      // Cleanup is handled within the unshare environment if we used it
      if (!this.currentMountPath) {
        await execAsync(`buildah --storage-driver vfs umount ${containerId}`);
        await execAsync(`buildah --storage-driver vfs rm ${containerId}`);
      }
      // Clear the mount path
      this.currentMountPath = undefined;
    } catch (error) {
      logger.warn(`Failed to cleanup container ${containerId}:`, error);
    }
  }
}