import { promisify } from 'util';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
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
  newImageName?: string;
  newImageTag?: string;
}

export interface PatchableVulnerability {
  id: string;
  cveId: string;
  packageName: string;
  currentVersion: string;
  fixedVersion: string;
  packageManager: string;
}

export class PatchExecutorTarUnshare {
  private workDir = process.env.SCANNER_WORKDIR || '/workspace';
  private patchDir = path.join(this.workDir, 'patches');

  async executePatch(request: PatchRequest): Promise<PatchOperation> {
    logger.info(`Starting unshare tar-based patch operation for image ${request.sourceImageId}`);
    
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
          request.selectedVulnerabilityIds!.includes(vuln.id)
        );
        logger.info(`Filtered to ${patchableVulns.length} selected vulnerabilities from ${request.selectedVulnerabilityIds.length} requested`);
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

      // Update status to pulling
      await this.updatePatchOperationStatus(patchOperation.id, 'PULLING');
      
      // Get or download the original tar file
      const originalTarPath = await this.getImageTar(image, scan.requestId);
      
      // Create working directory for this patch operation
      const patchWorkDir = path.join(this.patchDir, patchOperation.id);
      await fs.mkdir(patchWorkDir, { recursive: true });
      
      // Define output tar path with descriptive name
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
      const safeImageName = image.name.replace(/[\/:]/g, '_');
      const patchedTarPath = path.join(patchWorkDir, `patched-${safeImageName}-${timestamp}.tar`);
      
      // Update status to patching
      await this.updatePatchOperationStatus(patchOperation.id, 'PATCHING');
      
      // Generate patch commands
      const patchCommands = this.generatePatchCommands(patchableVulns);
      
      // Choose script based on environment
      // In development: NODE_ENV is 'development' OR we're not in a Docker container
      const isDevelopment = process.env.NODE_ENV === 'development' || 
                           (!process.env.NODE_ENV && !existsSync('/.dockerenv'));
      const scriptName = isDevelopment ? 'buildah-patch-dev.sh' : 'buildah-patch-container.sh';
      const scriptPath = path.join(process.cwd(), 'scripts', scriptName);
      const dryRunFlag = request.dryRun ? 'true' : 'false';
      
      logger.info(`Executing patch script with ${patchableVulns.length} vulnerabilities`);
      
      try {
        const { stdout, stderr } = await execAsync(
          `bash ${scriptPath} "${originalTarPath}" '${patchCommands}' "${patchedTarPath}" ${dryRunFlag}`,
          { 
            maxBuffer: 10 * 1024 * 1024 // 10MB buffer for large outputs
          }
        );
        
        if (stderr && !stderr.includes('warning')) {
          logger.warn(`Patch script stderr: ${stderr}`);
        }
        
        // Check if patch was successful
        if (!stdout.includes('PATCH_STATUS:SUCCESS')) {
          throw new Error('Patch operation did not complete successfully');
        }
        
        logger.info('Patch operation completed successfully');
      } catch (error) {
        logger.error('Patch script failed:', error);
        await this.updatePatchOperationStatus(patchOperation.id, 'FAILED', {
          failedCount: patchableVulns.length,
          completedAt: new Date()
        });
        throw error;
      }

      // Calculate results
      const successCount = request.dryRun ? 0 : patchableVulns.length;
      const failedCount = 0;

      // Save patch results to database and update progress
      let patchedCount = 0;
      for (const vuln of patchableVulns) {
        await prisma.patchResult.create({
          data: {
            patchOperationId: patchOperation.id,
            vulnerabilityId: vuln.id,
            cveId: vuln.cveId,
            packageName: vuln.packageName,
            originalVersion: vuln.currentVersion,
            targetVersion: vuln.fixedVersion,
            patchCommand: '', // Will be populated with actual command
            status: request.dryRun ? 'SKIPPED' : 'SUCCESS',
            packageManager: vuln.packageManager
          }
        });
        
        // Update patched count periodically
        patchedCount++;
        if (patchedCount % 5 === 0 || patchedCount === patchableVulns.length) {
          await prisma.patchOperation.update({
            where: { id: patchOperation.id },
            data: { patchedCount }
          });
        }
      }

      // Handle patched image
      let patchedImageId: string | null = null;
      
      if (!request.dryRun && successCount > 0) {
        await this.updatePatchOperationStatus(patchOperation.id, 'PUSHING');
        
        // Determine the final image name and tag
        const finalImageName = request.newImageName || image.name;
        const finalImageTag = request.newImageTag || request.targetTag || `${image.tag}-patched`;
        
        logger.info(`Patched TAR file created at: ${patchedTarPath}`);
        
        // If target registry specified, push to registry
        if (request.targetRegistry) {
          await this.pushToRegistry(
            patchedTarPath,
            request.targetRegistry,
            finalImageName,
            finalImageTag
          );
        }
        
        // Create new image record for patched version
        const patchedImage = await this.createPatchedImageRecord(
          image,
          `${finalImageName}:${finalImageTag}`,
          patchOperation.id
        );
        
        patchedImageId = patchedImage.id;
        
      // Move patched tar to reports directory for download
      // Use a unique filename that includes the patch operation ID and target image name
      const reportsDir = path.join(this.workDir, 'reports', scan.requestId);
      const safeFinalImageName = finalImageName.replace(/[\/:]/g, '_');
      const tarFileName = `patched-${safeFinalImageName}-${finalImageTag}-${patchOperation.id}.tar`;
      await fs.copyFile(patchedTarPath, path.join(reportsDir, tarFileName));
      logger.info(`Copied patched TAR to ${path.join(reportsDir, tarFileName)}`);
        
        // Trigger scan of the patched tar file directly
        logger.info(`Triggering automatic scan of patched tar file: ${patchedTarPath}`);
        await this.triggerTarScan(patchedTarPath, finalImageName, finalImageTag, patchedImage.id);
      }

      // Verify patches (status update for UI feedback)
      await this.updatePatchOperationStatus(patchOperation.id, 'VERIFYING');
      
      // Brief verification delay for UI feedback
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Update final status
      await this.updatePatchOperationStatus(patchOperation.id, 'COMPLETED', {
        patchedCount: successCount,
        failedCount: failedCount,
        patchedImageId: patchedImageId,
        completedAt: new Date()
      });

      // Save patch report
      await this.savePatchReport(scan.requestId, patchOperation.id, patchableVulns, request.dryRun);

      return patchOperation;

    } catch (error) {
      logger.error('Patch operation failed:', error);
      await this.updatePatchOperationStatus(patchOperation.id, 'FAILED', {
        completedAt: new Date()
      });
      throw error;
    }
  }

  private generatePatchCommands(vulnerabilities: PatchableVulnerability[]): string {
    // Group by package manager
    const grouped = new Map<string, PatchableVulnerability[]>();
    for (const vuln of vulnerabilities) {
      if (!grouped.has(vuln.packageManager)) {
        grouped.set(vuln.packageManager, []);
      }
      grouped.get(vuln.packageManager)!.push(vuln);
    }
    
    const commands: string[] = [];
    
    for (const [packageManager, vulns] of grouped) {
      if (packageManager === 'apt') {
        // First ensure gpg and apt-utils are available
        commands.push('chroot $mountpoint sh -c "which gpgv || (apt-get update && apt-get install -y --no-install-recommends gnupg apt-utils)"');
        
        // Update package lists
        commands.push('chroot $mountpoint apt-get update');
        
        // Install fixed versions - try exact version first, then fall back to upgrade
        // Group packages to handle version availability issues
        const packageNames = vulns.map(v => v.packageName).join(' ');
        
        // Try to upgrade packages to their latest available versions
        // This is more reliable than specifying exact versions that may not exist
        commands.push(`chroot $mountpoint apt-get install -y --only-upgrade ${packageNames} || chroot $mountpoint apt-get install -y ${packageNames}`);
        
        // Clean apt cache
        commands.push('chroot $mountpoint apt-get clean');
        commands.push('chroot $mountpoint rm -rf /var/lib/apt/lists/*');
        
      } else if (packageManager === 'apk') {
        // Update apk cache
        commands.push('chroot $mountpoint apk update');
        
        // For Alpine, we need to upgrade both libssl3 and libcrypto3 together as they're linked
        const packages = new Set(vulns.map(v => v.packageName));
        
        // If libssl3 is being patched, also include libcrypto3 and vice versa
        if (packages.has('libssl3') || packages.has('libcrypto3')) {
          packages.add('libssl3');
          packages.add('libcrypto3');
        }
        
        const packageList = Array.from(packages).join(' ');
        commands.push(`chroot $mountpoint apk upgrade ${packageList}`);
        
        // Clean cache
        commands.push('chroot $mountpoint rm -rf /var/cache/apk/*');
        
      } else if (packageManager === 'yum') {
        // Update packages
        const packages = vulns.map(v => `${v.packageName}-${v.fixedVersion}`).join(' ');
        commands.push(`chroot $mountpoint yum update -y ${packages}`);
        
        // Clean cache
        commands.push('chroot $mountpoint yum clean all');
      }
    }
    
    return commands.join(' && ');
  }

  private async getImageTar(image: any, requestId: string): Promise<string> {
    const safeImageName = image.name.replace(/[/:]/g, '_');
    // First try to find tar file with image digest hash (from scanning)
    const imageHash = image.digest ? image.digest.replace('sha256:', '') : '';
    const scanTarPath = imageHash ? path.join(this.workDir, 'images', `${safeImageName}-${imageHash}.tar`) : '';
    
    // Check if tar file from scan exists
    if (scanTarPath) {
      try {
        const stats = await fs.stat(scanTarPath);
        if (stats.size > 0) {
          logger.info(`Using existing scan tar file: ${scanTarPath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
          return scanTarPath;
        }
      } catch {
        logger.info(`Scan tar file not found at ${scanTarPath}`);
      }
    }
    
    // Fallback to requestId-based path
    const requestTarPath = path.join(this.workDir, 'images', `${safeImageName}-${requestId}.tar`);
    
    // Check if tar file already exists
    try {
      const stats = await fs.stat(requestTarPath);
      if (stats.size > 0) {
        logger.info(`Using existing tar file: ${requestTarPath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
        return requestTarPath;
      }
    } catch {
      logger.info(`Tar file not found at ${requestTarPath}`);
    }
    
    // Try to find any matching tar file with wildcard pattern
    const imagesDir = path.join(this.workDir, 'images');
    try {
      const files = await fs.readdir(imagesDir);
      const matchingFiles = files.filter(f => f.startsWith(safeImageName) && f.endsWith('.tar'));
      
      if (matchingFiles.length > 0) {
        // Sort by modification time and use the most recent
        const fileStats = await Promise.all(
          matchingFiles.map(async f => ({
            name: f,
            path: path.join(imagesDir, f),
            mtime: (await fs.stat(path.join(imagesDir, f))).mtime
          }))
        );
        
        fileStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
        const mostRecent = fileStats[0];
        
        logger.info(`Found existing tar file by pattern: ${mostRecent.path}`);
        return mostRecent.path;
      }
    } catch (error) {
      logger.warn('Failed to search for tar files:', error);
    }
    
    // If no tar file found, we'll need to download/export it
    const tarPath = requestTarPath;

    // Export from Docker if local source
    if (image.source === 'LOCAL_DOCKER' || image.registry === 'local') {
      logger.info(`Exporting local Docker image ${image.name}:${image.tag} to tar`);
      await execAsync(`docker save -o ${tarPath} ${image.name}:${image.tag}`);
      
      const stats = await fs.stat(tarPath);
      logger.info(`Exported tar file: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    } else {
      // Download from registry using skopeo
      const fullImageName = image.registry ? `${image.registry}/${image.name}` : image.name;
      const imageRef = `${fullImageName}:${image.tag}`;
      
      await execAsync(
        `skopeo copy --src-tls-verify=false docker://${imageRef} docker-archive:${tarPath}`
      );
    }
    
    return tarPath;
  }

  private async pushToRegistry(
    tarPath: string,
    registry: string,
    imageName: string,
    tag: string
  ): Promise<void> {
    const fullImageRef = `${registry}/${imageName}:${tag}`;
    logger.info(`Pushing patched image to ${fullImageRef}`);
    
    await execAsync(
      `skopeo copy --dest-tls-verify=false docker-archive:${tarPath} docker://${fullImageRef}`
    );
  }

  private async savePatchReport(
    requestId: string,
    operationId: string,
    vulnerabilities: PatchableVulnerability[],
    dryRun?: boolean
  ): Promise<void> {
    const reportDir = path.join(this.workDir, 'reports', requestId);
    const reportPath = path.join(reportDir, 'patch-report.json');
    
    const report = {
      operationId,
      timestamp: new Date().toISOString(),
      dryRun: dryRun || false,
      summary: {
        total: vulnerabilities.length,
        success: dryRun ? 0 : vulnerabilities.length,
        failed: 0,
        skipped: dryRun ? vulnerabilities.length : 0,
      },
      vulnerabilities: vulnerabilities.map(v => ({
        id: v.id,
        cveId: v.cveId,
        packageName: v.packageName,
        originalVersion: v.currentVersion,
        targetVersion: v.fixedVersion,
        packageManager: v.packageManager,
        status: dryRun ? 'SKIPPED' : 'SUCCESS'
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
        if (packageManager) {
          patchable.push({
            id: finding.id,
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

  private detectPackageManager(packageType: string): string | null {
    if (!packageType) return null;
    
    const typeToManager: Record<string, string> = {
      'deb': 'apt',
      'debian': 'apt',
      'ubuntu': 'apt',
      'rpm': 'yum',
      'redhat': 'yum',
      'centos': 'yum',
      'apk': 'apk',
      'alpine': 'apk'
    };
    
    return typeToManager[packageType.toLowerCase()] || null;
  }

  async createPatchedImageRecord(
    originalImage: any,
    patchedImageRef: string,
    operationId: string
  ): Promise<any> {
    const [name, tag] = patchedImageRef.split(':');
    const digest = `sha256:patched-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    
    const patchedImage = await prisma.image.create({
      data: {
        name,
        tag,
        source: 'LOCAL_DOCKER',
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

  private async triggerTarScan(tarPath: string, imageName: string, imageTag: string, imageId: string): Promise<void> {
    try {
      const scanRequest = {
        image: imageName,
        tag: imageTag,
        source: 'tar',
        tarPath: tarPath
      };

      logger.info(`Initiating scan for patched tar file: ${tarPath}`);
      
      const port = process.env.PORT || '3000';
      const response = await fetch(`http://localhost:${port}/api/scans/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scanRequest)
      });

      if (!response.ok) {
        logger.error(`Failed to trigger scan: ${response.statusText}`);
      } else {
        const result = await response.json();
        logger.info(`Scan triggered successfully: ${result.scanId}`);
      }
    } catch (error) {
      logger.error('Failed to trigger automatic scan:', error);
    }
  }
}
