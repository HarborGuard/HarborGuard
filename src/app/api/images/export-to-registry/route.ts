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
      patchedTarPath
    } = body;

    if (!sourceImage && !patchedTarPath) {
      return NextResponse.json(
        { error: 'Source image or patched tar path is required' },
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
      const [imageName, imageTag] = sourceImage.split(':');
      const safeImageName = imageName.replace(/[/:]/g, '_');
      const imagesDir = path.join(workDir, 'images');
      
      // Look for any matching tar file
      let tarPath: string | null = null;
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
        }
      } catch (error) {
        logger.warn('Failed to find tar files:', error);
      }
      
      if (tarPath) {
        // Push from existing tar file
        await provider.pushImage(tarPath, targetImageName, targetImageTag);
      } else {
        // Check if we can access Docker daemon
        try {
          await execAsync('docker version', { timeout: 5000 });
          // Export from Docker first
          tarPath = path.join(imagesDir, `${safeImageName}-export-${Date.now()}.tar`);
          await fs.mkdir(imagesDir, { recursive: true });
          
          const dockerExport = await execAsync(`docker save -o ${tarPath} ${sourceImage}`);
          if (dockerExport.stderr) {
            logger.warn('Docker export stderr:', dockerExport.stderr);
          }
          
          // Push the exported tar
          await provider.pushImage(tarPath, targetImageName, targetImageTag);
          
          // Clean up temporary tar
          await fs.unlink(tarPath).catch(() => {});
        } catch (dockerError) {
          // No Docker daemon, try direct copy between registries
          const sourceRef = sourceImage.includes('/') 
            ? sourceImage 
            : `docker.io/library/${sourceImage}`;
          
          // Use registry handler to copy image between registries
          await provider.copyImage(
            { 
              registry: sourceRef.split('/')[0],
              image: imageName, 
              tag: imageTag || 'latest' 
            },
            { 
              registry: targetRegistry.replace(/^https?:\/\//, ''),
              image: targetImageName, 
              tag: targetImageTag 
            }
          );
        }
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