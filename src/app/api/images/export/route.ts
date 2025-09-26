import { NextRequest, NextResponse } from 'next/server';
import { promisify } from 'util';
import { exec } from 'child_process';
import { logger } from '@/lib/logger';

const execAsync = promisify(exec);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tarPath, imageName, imageTag, sourceImage, scanId, digest } = body;
    
    if (!imageName || !imageTag) {
      return NextResponse.json(
        { error: 'imageName and imageTag are required' },
        { status: 400 }
      );
    }
    
    // If no tar path provided but we have scanId, use the scan's tar file
    if (!tarPath && scanId) {
      // Use flat structure (scanId.tar in images directory)
      const scanTarPath = `/workspace/images/${scanId}.tar`;

      try {
        await execAsync(`test -f ${scanTarPath}`);
        const loadResult = await execAsync(`docker load -i ${scanTarPath}`);
        logger.info(`Loaded image from scan tar: ${scanTarPath}`);
        logger.info(`Docker load output: ${loadResult.stdout}`);

        // The loaded image may have a different name, so we need to tag it
        const imageIdMatch = loadResult.stdout.match(/Loaded image(?: ID)?:\s*(.+)/);
        if (imageIdMatch && imageIdMatch[1]) {
          const loadedImage = imageIdMatch[1].trim();
          if (loadedImage !== `${imageName}:${imageTag}`) {
            await execAsync(`docker tag ${loadedImage} ${imageName}:${imageTag}`);
            logger.info(`Tagged ${loadedImage} as ${imageName}:${imageTag}`);
          }
        }

        return NextResponse.json({
          success: true,
          message: `Image ${imageName}:${imageTag} loaded into Docker from scan`
        });
      } catch (error: any) {
        logger.warn(`Scan tar file not found: ${scanTarPath}`);
      }
    }

    // If no tar path provided but sourceImage is, try to find it in Docker first
    if (!tarPath && sourceImage) {
      try {
        // Validate and clean up the sourceImage format
        // Remove any duplicate structure like "image:image:tag"
        let cleanSourceImage = sourceImage;

        // Check for malformed references (e.g., "moby/buildkit:moby/buildkit:tag")
        const parts = sourceImage.split(':');
        if (parts.length > 2) {
          // Handle case where image name is duplicated
          const possibleDuplicate = parts[0] + ':' + parts[1];
          if (sourceImage.includes(possibleDuplicate + ':')) {
            // This is likely a duplicate, use the second occurrence
            cleanSourceImage = parts[1] + ':' + parts[2];
            logger.warn(`Detected malformed image reference: ${sourceImage}, cleaned to: ${cleanSourceImage}`);
          }
        }

        // Check if the image exists in Docker
        await execAsync(`docker image inspect ${cleanSourceImage}`);

        // Tag the existing image with the new name
        if (cleanSourceImage !== `${imageName}:${imageTag}`) {
          await execAsync(`docker tag ${cleanSourceImage} ${imageName}:${imageTag}`);
          logger.info(`Tagged ${cleanSourceImage} as ${imageName}:${imageTag}`);
        }

        return NextResponse.json({
          success: true,
          message: `Image ${imageName}:${imageTag} is ready in Docker`
        });
      } catch (error: any) {
        logger.error(`Image not found in Docker: ${error.message}`);
        // If we have scanId/digest, we should have handled it above
        // Otherwise return error
        return NextResponse.json(
          { error: 'Image not found in Docker and no scan tar available', message: error.message },
          { status: 404 }
        );
      }
    }
    
    if (!tarPath) {
      return NextResponse.json(
        { error: 'Either tarPath or sourceImage is required' },
        { status: 400 }
      );
    }
    
    logger.info(`Loading patched image from ${tarPath}`);
    logger.info(`Will tag as ${imageName}:${imageTag}`);
    
    // Load the tar file into Docker
    const loadResult = await execAsync(`docker load -i ${tarPath}`);
    logger.info(`Docker load stdout: ${loadResult.stdout}`);
    logger.info(`Docker load stderr: ${loadResult.stderr || 'no stderr'}`);
    
    // Extract the loaded image name and tag it properly
    const imageIdMatch = loadResult.stdout.match(/Loaded image:\s*(.+)/);
    if (imageIdMatch && imageIdMatch[1]) {
      const loadedImage = imageIdMatch[1].trim();
      logger.info(`Extracted loaded image name: '${loadedImage}'`);
      logger.info(`Tagging ${loadedImage} as ${imageName}:${imageTag}`);
      
      try {
        await execAsync(`docker tag ${loadedImage} ${imageName}:${imageTag}`);
        logger.info(`Successfully tagged image as ${imageName}:${imageTag}`);
      } catch (tagError: any) {
        logger.error(`Failed to tag ${loadedImage}: ${tagError.message}`);
        // Try fallback patterns
        const possibleNames = [
          'localhost/patched-image:latest',
          'patched-image:latest',
          'patched-image'
        ];
        
        let tagged = false;
        for (const name of possibleNames) {
          try {
            await execAsync(`docker tag ${name} ${imageName}:${imageTag}`);
            logger.info(`Successfully tagged ${name} as ${imageName}:${imageTag}`);
            tagged = true;
            break;
          } catch (e: any) {
            logger.warn(`Failed to tag ${name}: ${e.message}`);
          }
        }
        
        if (!tagged) {
          throw new Error('Failed to tag patched image');
        }
      }
    }
    
    return NextResponse.json({
      success: true,
      message: `Image ${imageName}:${imageTag} loaded into Docker successfully`
    });
    
  } catch (error: any) {
    logger.error('Failed to export image to Docker:', error);
    
    if (error.message?.includes('Cannot connect to the Docker daemon')) {
      return NextResponse.json(
        { error: 'Docker daemon is not available', message: 'Please ensure Docker is running' },
        { status: 503 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to export image', message: error.message },
      { status: 500 }
    );
  }
}