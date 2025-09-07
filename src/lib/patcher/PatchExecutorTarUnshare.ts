import { promisify } from 'util';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
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
  skipDockerLoad?: boolean;  // Skip loading into Docker daemon
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

      // Get or download the original tar file
      const originalTarPath = await this.getImageTar(image, scan.requestId);
      
      // Create working directory for this patch operation
      const patchWorkDir = path.join(this.patchDir, patchOperation.id);
      await fs.mkdir(patchWorkDir, { recursive: true });
      
      // Define output tar path with descriptive name
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
      const patchedTarPath = path.join(patchWorkDir, `patched-${image.name}-${timestamp}.tar`);
      
      // Update status to patching
      await this.updatePatchOperationStatus(patchOperation.id, 'PATCHING');
      
      // Generate patch commands
      const patchCommands = this.generatePatchCommands(patchableVulns);
      
      // Execute patch using buildah unshare script
      const scriptPath = path.join(process.cwd(), 'scripts', 'buildah-patch-full.sh');
      const dryRunFlag = request.dryRun ? 'true' : 'false';
      
      logger.info(`Executing patch script with ${patchableVulns.length} vulnerabilities`);
      
      try {
        const { stdout, stderr } = await execAsync(
          `bash ${scriptPath} "${originalTarPath}" '${patchCommands}' "${patchedTarPath}" ${dryRunFlag}`,
          { maxBuffer: 10 * 1024 * 1024 } // 10MB buffer for large outputs
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

      // Save patch results to database
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
      }

      // Handle patched image
      let patchedImageId: string | null = null;
      
      if (!request.dryRun && successCount > 0) {
        await this.updatePatchOperationStatus(patchOperation.id, 'PUSHING');
        
        // Determine the final image name and tag
        const finalImageName = request.newImageName || image.name;
        const finalImageTag = request.newImageTag || request.targetTag || `${image.tag}-patched`;
        
        if (!request.skipDockerLoad) {
          // Load patched image into Docker for scanning
          logger.info(`Loading patched image from ${patchedTarPath}`);
          logger.info(`Will tag as ${finalImageName}:${finalImageTag}`);
          const loadResult = await execAsync(`docker load -i ${patchedTarPath}`);
          logger.info(`Docker load stdout: ${loadResult.stdout}`);
          logger.info(`Docker load stderr: ${loadResult.stderr || 'no stderr'}`);
          
          // The loaded image will have the name from buildah (patched-image)
          // We need to extract the actual loaded image ID and tag it
          // Docker load output format: "Loaded image: localhost/patched-image:latest"
          const imageIdMatch = loadResult.stdout.match(/Loaded image:\s*(.+)/);
          if (imageIdMatch && imageIdMatch[1]) {
            const loadedImage = imageIdMatch[1].trim();
            logger.info(`Extracted loaded image name: '${loadedImage}'`);
            logger.info(`Tagging ${loadedImage} as ${finalImageName}:${finalImageTag}`);
            try {
              const tagResult = await execAsync(`docker tag ${loadedImage} ${finalImageName}:${finalImageTag}`);
              logger.info(`Tag command completed. stdout: ${tagResult.stdout || 'empty'}, stderr: ${tagResult.stderr || 'empty'}`);
            } catch (tagError: any) {
              logger.error(`Failed to tag ${loadedImage}: ${tagError.message}`);
              throw tagError;
            }
          } else {
            // Fallback: try multiple possible names
            logger.warn(`Could not extract loaded image name from output: ${loadResult.stdout}`);
            logger.warn('Trying known patterns...');
            const possibleNames = [
              'localhost/patched-image:latest',
              'patched-image:latest',
              'patched-image'
            ];
            
            let tagged = false;
            for (const name of possibleNames) {
              try {
                logger.info(`Attempting to tag ${name} as ${finalImageName}:${finalImageTag}`);
                const tagResult = await execAsync(`docker tag ${name} ${finalImageName}:${finalImageTag}`);
                logger.info(`Successfully tagged ${name} as ${finalImageName}:${finalImageTag}`);
                tagged = true;
                break;
              } catch (e: any) {
                logger.warn(`Failed to tag ${name}: ${e.message}`);
              }
            }
            
            if (!tagged) {
              logger.error('Failed to tag patched image with any known pattern');
              // Don't throw here - continue with the process
            }
          }
        } else {
          logger.info(`Skipping Docker load as requested. TAR file saved at: ${patchedTarPath}`);
        }
        
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
        const tarFileName = `patched-${finalImageName}-${finalImageTag}-${patchOperation.id}.tar`;
        await fs.copyFile(patchedTarPath, path.join(reportsDir, tarFileName));
        logger.info(`Copied patched TAR to ${path.join(reportsDir, tarFileName)}`);
        
        // Automatically trigger a scan of the patched image (only if loaded into Docker)
        if (!request.skipDockerLoad) {
          logger.info(`Triggering automatic scan of patched image ${finalImageName}:${finalImageTag}`);
          await this.triggerScan(finalImageName, finalImageTag, patchedImage.id);
        } else {
          logger.info('Skipping automatic scan since image was not loaded into Docker');
        }
      }

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
        // Update package lists first
        commands.push('chroot $mountpoint apt-get update');
        
        // Install fixed versions
        const packages = vulns.map(v => `${v.packageName}=${v.fixedVersion}`).join(' ');
        commands.push(`chroot $mountpoint apt-get install -y ${packages}`);
        
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
    const tarPath = path.join(this.workDir, 'images', `${safeImageName}-${requestId}.tar`);
    
    // Check if tar file already exists
    try {
      const stats = await fs.stat(tarPath);
      if (stats.size > 0) {
        logger.info(`Using existing tar file: ${tarPath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
        return tarPath;
      }
    } catch {
      logger.info(`Tar file not found at ${tarPath}`);
    }

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

  private async createPatchedImageRecord(
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
        registry: 'local',
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

  private async triggerScan(imageName: string, imageTag: string, imageId: string): Promise<void> {
    try {
      const scanRequest = {
        image: imageName,
        tag: imageTag,
        source: 'local'
      };

      logger.info(`Initiating scan for patched image ${imageName}:${imageTag}`);
      
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