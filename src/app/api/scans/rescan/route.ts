import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@/generated/prisma';
import { logger } from '@/lib/logger';
import { ScannerService } from '@/lib/scanner/ScannerService';
import { auditLogger } from '@/lib/audit-logger';
import type { ScanRequest } from '@/types';

const prisma = new PrismaClient();
const scannerService = ScannerService.getInstance();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { scanId, imageId, tag } = body;

    if (!scanId && !imageId) {
      return NextResponse.json(
        { error: 'Either scanId or imageId is required' },
        { status: 400 }
      );
    }

    // Fetch the original scan or image data from the database
    let scanData;
    let imageData;

    if (scanId) {
      scanData = await prisma.scan.findUnique({
        where: { id: scanId },
        include: { image: true }
      });

      if (!scanData) {
        return NextResponse.json(
          { error: 'Scan not found' },
          { status: 404 }
        );
      }

      imageData = scanData.image;
    } else {
      // If only imageId is provided, get the most recent scan for that image
      imageData = await prisma.image.findUnique({
        where: { id: imageId }
      });

      if (!imageData) {
        return NextResponse.json(
          { error: 'Image not found' },
          { status: 404 }
        );
      }

      // Get the most recent scan for this image to inherit settings
      scanData = await prisma.scan.findFirst({
        where: { imageId: imageId },
        orderBy: { createdAt: 'desc' },
        include: { image: true }
      });
    }

    // Determine the actual tag to use
    // If tag is explicitly provided, use it
    // Otherwise use the tag from the database (scan or image)
    let actualTag = tag;
    if (!actualTag) {
      // Try to get the tag from the most recent scan
      if (scanData && scanData.tag) {
        actualTag = scanData.tag;
      } else if (imageData.tag) {
        actualTag = imageData.tag;
      } else {
        actualTag = 'latest';
      }
    }

    // Build the scan request from the database data
    const scanRequest: ScanRequest = {
      image: imageData.name,
      tag: actualTag,
      registry: undefined,
      registryType: undefined,
      source: undefined,
      dockerImageId: undefined,
      repositoryId: imageData.primaryRepositoryId || undefined,
    };

    // Determine the source based on the image's source
    switch (imageData.source) {
      case 'LOCAL_DOCKER':
        scanRequest.source = 'local';
        scanRequest.dockerImageId = imageData.dockerImageId || undefined;
        break;
      case 'REGISTRY':
      case 'REGISTRY_PRIVATE':
        scanRequest.source = 'registry';
        // Map registry display names to actual registry URLs
        if (imageData.registry === 'Docker Hub Public' || imageData.registry === 'Docker Hub') {
          // For public Docker Hub, explicitly set docker.io as registry
          // The registryType will trigger creation of a temp repository without auth
          scanRequest.registry = 'docker.io';
          scanRequest.registryType = 'DOCKERHUB';
        } else if (imageData.registry === 'GHCR Public') {
          scanRequest.registry = 'ghcr.io';
          scanRequest.registryType = 'GHCR';
        } else if (imageData.registry) {
          scanRequest.registry = imageData.registry;
          scanRequest.registryType = imageData.registryType as "DOCKERHUB" | "GHCR" | "GITLAB" | "GENERIC" | "ECR" | "GCR" || undefined;
        } else {
          // Default to Docker Hub if no registry is specified
          scanRequest.registry = 'docker.io';
          scanRequest.registryType = 'DOCKERHUB';
        }
        break;
      case 'FILE_UPLOAD':
        scanRequest.source = 'tar';
        break;
      default:
        scanRequest.source = 'registry';
    }

    logger.info(`Starting rescan for ${imageData.name}:${scanRequest.tag}`, {
      source: scanRequest.source,
      registry: scanRequest.registry,
      registryType: scanRequest.registryType,
      originalRegistry: imageData.registry,
      originalRegistryType: imageData.registryType
    });

    // Start the scan
    const result = await scannerService.startScan(scanRequest);

    // Log the rescan action
    await auditLogger.scanStart(
      request,
      `${imageData.name}:${scanRequest.tag}`,
      scanRequest.source || 'registry'
    );

    return NextResponse.json({
      success: true,
      requestId: result.requestId,
      scanId: result.scanId,
      message: result.queued ? 'Rescan queued successfully' : 'Rescan started successfully',
      queued: result.queued,
      queuePosition: result.queuePosition
    });

  } catch (error) {
    logger.error('Failed to start rescan:', error);
    return NextResponse.json(
      { error: 'Failed to start rescan', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}