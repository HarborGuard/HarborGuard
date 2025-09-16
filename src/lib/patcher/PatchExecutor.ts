import { promisify } from 'util';
import { exec } from 'child_process';
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
  PatchResultStatus,
  PatchStrategy as PatchStrategyType 
} from '@/generated/prisma';

const execAsync = promisify(exec);

export interface PatchRequest {
  sourceImageId: string;
  scanId: string;
  targetRegistry?: string;
  targetTag?: string;
  dryRun?: boolean;
}

export interface PatchableVulnerability {
  cveId: string;
  packageName: string;
  currentVersion: string;
  fixedVersion: string;
  packageManager: string;
}

export class PatchExecutor {
  private strategies: Map<string, PatchStrategy>;
  private workDir = process.env.PATCH_WORKDIR || '/workspace/patches';

  constructor() {
    this.strategies = new Map<string, PatchStrategy>([
      ['apt', new AptPatchStrategy()],
      ['yum', new YumPatchStrategy()],
      ['apk', new ApkPatchStrategy()],
    ]);
  }

  async executePatch(request: PatchRequest): Promise<PatchOperation> {
    logger.info(`Starting patch operation for image ${request.sourceImageId}`);
    
    // Create patch operation record
    const patchOperation = await this.createPatchOperation(request);
    
    try {
      // Update status to analyzing
      await this.updatePatchOperationStatus(patchOperation.id, 'ANALYZING');
      
      // Get image details
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

      // Analyze vulnerabilities for patchability
      const patchableVulns = await this.analyzePatchableVulnerabilities(
        image.scans[0].vulnerabilityFindings
      );

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

      // Build source image reference
      const sourceImageRef = this.buildImageReference(image);
      
      // Update status to building
      await this.updatePatchOperationStatus(patchOperation.id, 'BUILDING');
      
      // Create working container with Buildah
      const containerId = await this.createWorkingContainer(sourceImageRef);
      
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

      // Commit and push patched image if not dry run
      let patchedImageId: string | null = null;
      if (!request.dryRun && successCount > 0) {
        await this.updatePatchOperationStatus(patchOperation.id, 'PUSHING');
        
        const patchedImageRef = await this.commitAndPushImage(
          containerId,
          image,
          request.targetRegistry,
          request.targetTag
        );
        
        // Create new image record for patched version
        const patchedImage = await this.createPatchedImageRecord(
          image,
          patchedImageRef,
          patchOperation.id
        );
        
        patchedImageId = patchedImage.id;
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

  private async createPatchOperation(request: PatchRequest): Promise<PatchOperation> {
    // Determine patch strategy based on image
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
    // For now, detect based on image name patterns
    // This could be enhanced by actually inspecting the image
    const imageName = image.name.toLowerCase();
    
    if (imageName.includes('ubuntu') || imageName.includes('debian')) {
      return 'APT';
    } else if (imageName.includes('centos') || imageName.includes('rhel') || imageName.includes('fedora')) {
      return 'YUM';
    } else if (imageName.includes('alpine')) {
      return 'APK';
    } else {
      return 'MULTI'; // Will try to detect at runtime
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
        // Determine package manager based on package type
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

  private buildImageReference(image: any): string {
    return `${image.name}:${image.tag}`;
  }

  private async createWorkingContainer(imageRef: string): Promise<string> {
    logger.info(`Creating working container from ${imageRef}`);
    const { stdout } = await execAsync(`buildah --storage-driver vfs from ${imageRef}`);
    const containerId = stdout.trim();
    logger.info(`Created container: ${containerId}`);
    return containerId;
  }

  private async mountContainer(containerId: string): Promise<string> {
    logger.info(`Mounting container ${containerId}`);
    const { stdout } = await execAsync(`buildah --storage-driver vfs mount ${containerId}`);
    const mountPath = stdout.trim();
    logger.info(`Mounted at: ${mountPath}`);
    return mountPath;
  }

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

  private async commitAndPushImage(
    containerId: string,
    originalImage: any,
    targetRegistry?: string,
    targetTag?: string
  ): Promise<string> {
    const registry = targetRegistry || 'localhost:5000';
    const tag = targetTag || `${originalImage.tag}-patched`;
    const imageName = `${registry}/${originalImage.name}:${tag}`;
    
    logger.info(`Committing patched image as ${imageName}`);
    
    // Commit the container
    await execAsync(`buildah --storage-driver vfs commit ${containerId} ${imageName}`);
    
    // Push to registry
    logger.info(`Pushing image to registry`);
    await execAsync(`buildah --storage-driver vfs push ${imageName}`);
    
    return imageName;
  }

  private async createPatchedImageRecord(
    originalImage: any,
    patchedImageRef: string,
    operationId: string
  ): Promise<any> {
    // Parse the patched image reference
    const parts = patchedImageRef.split('/');
    const registry = parts.length > 2 ? parts.slice(0, -1).join('/') : parts[0];
    const [name, tag] = parts[parts.length - 1].split(':');
    
    // Get digest of patched image
    const { stdout } = await execAsync(
      `skopeo inspect --format '{{.Digest}}' docker://${patchedImageRef}`
    );
    const digest = stdout.trim();
    
    // Create new image record
    const patchedImage = await prisma.image.create({
      data: {
        name,
        tag,
        source: 'REGISTRY',
        digest,
        platform: originalImage.platform,
        sizeBytes: originalImage.sizeBytes // Will be updated on next scan
      }
    });
    
    // Create patched image relationship record
    await prisma.patchedImage.create({
      data: {
        originalImageId: originalImage.id,
        patchedImageId: patchedImage.id,
        patchOperationId: operationId,
        originalCveCount: 0, // Will be calculated
        remainingCveCount: 0, // Will be calculated after rescan
        patchedCveCount: 0, // Will be calculated
        patchEfficiency: 0.0 // Will be calculated
      }
    });
    
    return patchedImage;
  }

  private async cleanupContainer(containerId: string): Promise<void> {
    try {
      logger.info(`Cleaning up container ${containerId}`);
      await execAsync(`buildah --storage-driver vfs umount ${containerId}`);
      await execAsync(`buildah --storage-driver vfs rm ${containerId}`);
    } catch (error) {
      logger.warn(`Failed to cleanup container ${containerId}:`, error);
    }
  }
}