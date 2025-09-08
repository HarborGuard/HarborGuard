import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import path from 'path';
import fs from 'fs/promises';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      sourceImage,
      targetRegistry,
      targetImageName,
      targetImageTag,
      repositoryId,
      patchedTarPath
    } = body;

    if (!sourceImage || !targetRegistry || !targetImageName || !targetImageTag) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Build target image reference
    const targetImage = `${targetRegistry}/${targetImageName}:${targetImageTag}`.replace(/^https?:\/\//, '');
    
    // Get authentication if repository is configured
    let authArgs = '';
    if (repositoryId && repositoryId !== 'custom') {
      const repository = await prisma.repository.findUnique({
        where: { id: repositoryId },
        select: {
          username: true,
          encryptedPassword: true,
          registryUrl: true
        }
      });

      if (repository && repository.username && repository.encryptedPassword) {
        // Note: encryptedPassword is stored in plain text for now
        // TODO: Implement proper encryption/decryption
        authArgs = `--dest-creds="${repository.username}:${repository.encryptedPassword}" `;
      }
    }

    // Determine source and method
    let copyCommand = '';
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
      
      copyCommand = `skopeo copy --dest-tls-verify=false ${authArgs}docker-archive:${tarPath} docker://${targetImage}`;
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
        copyCommand = `skopeo copy --dest-tls-verify=false ${authArgs}docker-archive:${tarPath} docker://${targetImage}`;
      } else {
        // Check if we can access Docker daemon
        try {
          await execAsync('docker version', { timeout: 5000 });
          // Export from Docker first
          tarPath = path.join(imagesDir, `${safeImageName}-export-${Date.now()}.tar`);
          await execAsync(`docker save -o ${tarPath} ${sourceImage}`);
          copyCommand = `skopeo copy --dest-tls-verify=false ${authArgs}docker-archive:${tarPath} docker://${targetImage}`;
        } catch {
          // Try direct registry to registry copy (if source is from a registry)
          copyCommand = `skopeo copy --src-tls-verify=false --dest-tls-verify=false ${authArgs}docker://${sourceImage} docker://${targetImage}`;
        }
      }
    }

    logger.info(`Executing export: ${copyCommand.replace(/--dest-creds="[^"]*"/, '--dest-creds="***"')}`);
    
    // Execute the copy command
    const { stdout, stderr } = await execAsync(copyCommand, {
      timeout: 300000 // 5 minutes timeout
    });
    
    logger.info('Export successful:', stdout);
    if (stderr) {
      logger.warn('Export warnings:', stderr);
    }

    return NextResponse.json({
      success: true,
      message: `Image exported to ${targetImage}`,
      targetImage
    });

  } catch (error: any) {
    logger.error('Export to registry failed:', error);
    
    // Parse common skopeo errors
    let errorMessage = error.message || 'Export failed';
    if (errorMessage.includes('unauthorized')) {
      errorMessage = 'Authentication failed. Please check repository credentials.';
    } else if (errorMessage.includes('no such host')) {
      errorMessage = 'Registry host not found. Please check the registry URL.';
    } else if (errorMessage.includes('connection refused')) {
      errorMessage = 'Connection refused. Is the registry running and accessible?';
    }
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}