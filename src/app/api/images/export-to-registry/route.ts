import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import path from 'path';
import fs from 'fs/promises';
import { promisify } from 'util';
import { exec } from 'child_process';
import { RegistryProviderFactory } from '@/lib/registry/providers/RegistryProviderFactory';
import type { Repository } from '@/generated/prisma';

const execAsync = promisify(exec);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      sourceImage,
      targetRegistry,
      targetImageName,
      targetImageTag = 'latest',
      repositoryId,
      patchedTarPath,
      scanId
    } = body;

    logger.info('Export to registry request:', {
      sourceImage,
      targetRegistry,
      targetImageName,
      targetImageTag,
      repositoryId,
      patchedTarPath,
      scanId,
      hasScanId: !!scanId
    });

    if (!sourceImage && !patchedTarPath && !scanId) {
      return NextResponse.json(
        { error: 'Source image, scanId, or patched tar path is required' },
        { status: 400 }
      );
    }

    if (!targetRegistry || !targetImageName) {
      return NextResponse.json(
        { error: 'Target registry and image name are required' },
        { status: 400 }
      );
    }

    // Build target image reference
    const targetImage = `${targetRegistry}/${targetImageName}:${targetImageTag}`.replace(/^https?:\/\//, '');
    
    // Get repository and use registry handler for export
    let repository: Repository | null = null;
    if (repositoryId && repositoryId !== 'custom') {
      repository = await prisma.repository.findUnique({
        where: { id: repositoryId }
      });
    }
    
    // If no repository, create a temporary one for the target registry
    if (!repository) {
      repository = {
        id: 'temp-export',
        name: 'Export Target',
        type: 'GENERIC',
        protocol: targetRegistry.startsWith('https://') ? 'https' : 'http',
        registryUrl: targetRegistry.replace(/^https?:\/\//, ''),
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

    // Create registry provider
    const provider = RegistryProviderFactory.createFromRepository(repository);
    const workDir = process.env.SCANNER_WORKDIR || '/workspace';
    
    if (patchedTarPath) {
      // Export from tar file (patched image)
      const tarPath = patchedTarPath.startsWith('/') 
        ? patchedTarPath 
        : path.join(workDir, patchedTarPath);
      
      // Check if tar file exists
      try {
        await fs.access(tarPath);
      } catch {
        return NextResponse.json(
          { error: `TAR file not found at ${tarPath}` },
          { status: 404 }
        );
      }
      
      // Use registry handler to push the patched image
      await provider.pushImage(tarPath, targetImageName, targetImageTag);
      
      return NextResponse.json({
        success: true,
        message: `Successfully exported patched image to ${targetImage}`,
        targetImage
      });
    } else {
      // Try to find existing tar file for the image
      const imagesDir = path.join(workDir, 'images');
      let tarPath: string | null = null;

      // First priority: Use scanId if provided (scans always create {scanId}.tar)
      if (scanId) {
        const scanTarPath = path.join(imagesDir, `${scanId}.tar`);
        try {
          await fs.access(scanTarPath);
          tarPath = scanTarPath;
          logger.info(`Found tar file for scan ${scanId}: ${tarPath}`);
        } catch {
          logger.warn(`No tar file found for scanId ${scanId} at ${scanTarPath}`);
        }
      } else if (sourceImage) {
        // Fallback: If no scanId provided, try to find the most recent scan for this image
        const [imageName, imageTag] = sourceImage.split(':');
        try {
          const mostRecentScan = await prisma.scan.findFirst({
            where: {
              image: {
                name: imageName,
                tag: imageTag || 'latest'
              },
              status: 'SUCCESS'
            },
            orderBy: {
              createdAt: 'desc'
            }
          });

          if (mostRecentScan) {
            const scanTarPath = path.join(imagesDir, `${mostRecentScan.id}.tar`);
            try {
              await fs.access(scanTarPath);
              tarPath = scanTarPath;
              logger.info(`Found tar file for most recent scan ${mostRecentScan.id}: ${tarPath}`);
            } catch {
              logger.warn(`No tar file found for most recent scan ${mostRecentScan.id}`);
            }
          }
        } catch (error) {
          logger.warn('Failed to find most recent scan:', error);
        }
      }

      // Second priority: Look for tar files by image name
      if (!tarPath && sourceImage) {
        const [imageName, imageTag] = sourceImage.split(':');
        const safeImageName = imageName.replace(/[/:]/g, '_');

        try {
          const files = await fs.readdir(imagesDir);
          const matchingFiles = files.filter(f =>
            f.startsWith(safeImageName) && f.endsWith('.tar')
          );

          if (matchingFiles.length > 0) {
            // Use the most recent file
            const fileStats = await Promise.all(
              matchingFiles.map(async f => ({
                path: path.join(imagesDir, f),
                mtime: (await fs.stat(path.join(imagesDir, f))).mtime
              }))
            );
            fileStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
            tarPath = fileStats[0].path;
            logger.info(`Found tar file by image name: ${tarPath}`);
          }
        } catch (error) {
          logger.warn('Failed to find tar files by image name:', error);
        }
      }
      
      if (tarPath) {
        // Push from existing tar file
        logger.info(`Exporting from tar file: ${tarPath}`);
        await provider.pushImage(tarPath, targetImageName, targetImageTag);
      } else if (scanId) {
        // If scanId was provided but no tar found, this is an error
        return NextResponse.json(
          { error: `Scan tar file not found for scanId: ${scanId}. The scan may have failed or the tar file was cleaned up.` },
          { status: 404 }
        );
      } else if (!sourceImage) {
        return NextResponse.json(
          { error: 'No tar file found and no source image specified' },
          { status: 400 }
        );
      } else {
        // Fallback: Use registry-to-registry copy with skopeo
        const [imageName, imageTag] = sourceImage.split(':');

        logger.warn('No tar file found, falling back to registry-to-registry copy');

        // Try to find the image in database to get its actual registry
        let sourceRegistry: string | null = null;
        try {
          const dbImage = await prisma.image.findFirst({
            where: {
              name: imageName,
              tag: imageTag || 'latest'
            },
            include: {
              primaryRepository: true
            },
            orderBy: {
              createdAt: 'desc'
            }
          });

          if (dbImage) {
            // First try to use the primary repository's registryUrl
            if (dbImage.primaryRepository?.registryUrl) {
              sourceRegistry = dbImage.primaryRepository.registryUrl;
              logger.info(`Found source registry from primaryRepository: ${sourceRegistry}`);
            }
            // Fallback: Try to map registryType to registry URL
            else if (dbImage.registryType) {
              const registryTypeMap: Record<string, string> = {
                'GHCR': 'ghcr.io',
                'DOCKERHUB': 'docker.io',
                'GCR': 'gcr.io',
                'ECR': 'amazonaws.com',
                'GITLAB': 'registry.gitlab.com'
              };
              sourceRegistry = registryTypeMap[dbImage.registryType] || null;
              if (sourceRegistry) {
                logger.info(`Mapped registryType ${dbImage.registryType} to ${sourceRegistry}`);
              }
            }
            // Last resort: Use the registry field if it looks like a domain
            else if (dbImage.registry && !dbImage.registry.includes(' ')) {
              sourceRegistry = dbImage.registry;
              logger.info(`Using registry field: ${sourceRegistry}`);
            }
          }
        } catch (dbError) {
          logger.warn('Failed to lookup image in database:', dbError);
        }

        // If we still don't have a registry, try to detect it from the image name
        if (!sourceRegistry) {
          // Check for common registry patterns
          if (imageName.includes('ghcr.io/') || imageName.startsWith('ghcr.io/')) {
            sourceRegistry = 'ghcr.io';
          } else if (imageName.includes('gcr.io/') || imageName.startsWith('gcr.io/')) {
            sourceRegistry = 'gcr.io';
          } else if (imageName.includes('registry.gitlab.com/')) {
            sourceRegistry = 'registry.gitlab.com';
          } else if (sourceImage.includes('/')) {
            // Default to docker.io for user/repo format
            sourceRegistry = 'docker.io';
          } else {
            // Official Docker Hub images
            sourceRegistry = 'docker.io';
          }
        }

        const cleanImageName = imageName
          .replace(/^ghcr\.io\//, '')
          .replace(/^gcr\.io\//, '')
          .replace(/^docker\.io\//, '')
          .replace(/^registry\.gitlab\.com\//, '');

        const sourceRef = `${sourceRegistry}/${cleanImageName}`;

        // Use registry handler to copy image between registries
        logger.info(`Copying image from ${sourceRef}:${imageTag || 'latest'} to ${targetRegistry}/${targetImageName}:${targetImageTag}`);
        await provider.copyImage(
          {
            registry: sourceRegistry,
            image: cleanImageName,
            tag: imageTag || 'latest'
          },
          {
            registry: targetRegistry.replace(/^https?:\/\//, ''),
            image: targetImageName,
            tag: targetImageTag
          }
        );
      }
      
      return NextResponse.json({
        success: true,
        message: `Successfully exported ${sourceImage} to ${targetImage}`,
        targetImage
      });
    }
  } catch (error) {
    logger.error('Export to registry failed:', error);
    return NextResponse.json(
      { 
        error: 'Export failed', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}