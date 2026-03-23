import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { PrismaClient } from '@/generated/prisma';
import { logger } from '@/lib/logger';
import { ScannerService } from '@/lib/scanner/ScannerService';
import { auditLogger } from '@/lib/audit-logger';
import type { ScanRequest } from '@/types';
import { apiError } from '@/lib/api/api-utils';

const RescanSchema = z.object({
  scanId: z.string().optional(),
  imageId: z.string().optional(),
  tag: z.string().optional(),
}).refine(data => data.scanId || data.imageId, {
  message: 'Either scanId or imageId is required',
});

const prisma = new PrismaClient();
const scannerService = ScannerService.getInstance();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = RescanSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues },
        { status: 400 }
      );
    }

    const { scanId, imageId, tag } = parsed.data;

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

    // Reconstruct the full image ref for registry scans.
    // The DB stores the short name (e.g. "docker/library/alpine") but
    // the sensor needs the full ref (e.g. "public.ecr.aws/docker/library/alpine").
    let fullImageName = imageData.name;
    if (imageData.primaryRepositoryId && (imageData.source === 'REGISTRY' || imageData.source === 'REGISTRY_PRIVATE')) {
      const repo = await prisma.repository.findUnique({
        where: { id: imageData.primaryRepositoryId },
        select: { registryUrl: true },
      });
      if (repo?.registryUrl) {
        const registryHost = repo.registryUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
        // Only prepend if the image name doesn't already start with the registry host
        if (!fullImageName.startsWith(registryHost)) {
          fullImageName = `${registryHost}/${fullImageName}`;
        }
      }
    }

    // Build the scan request from the database data
    const scanRequest: ScanRequest = {
      image: fullImageName,
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
        // For local Docker rescans, use local source without any registry info
        scanRequest.source = 'local';
        scanRequest.dockerImageId = imageData.dockerImageId || undefined;
        // Don't set registry or registryType for local Docker scans
        break;
      case 'REGISTRY':
      case 'REGISTRY_PRIVATE':
        // For registry rescans, use the repository from the database
        scanRequest.source = 'registry';

        // Use the primary repository ID if available - this ensures we use the correct provider
        if (imageData.primaryRepositoryId) {
          scanRequest.repositoryId = imageData.primaryRepositoryId;
        } else if (imageData.registry) {
          // Fallback: try to find a matching repository by name
          const matchingRepo = await prisma.repository.findFirst({
            where: {
              OR: [
                { name: imageData.registry },
                { registryUrl: imageData.registry }
              ]
            }
          });

          if (matchingRepo) {
            scanRequest.repositoryId = matchingRepo.id;
          } else {
            // Only set registry type if we don't have a repository
            // This will cause a temporary repository to be created (which may fail)
            scanRequest.registryType = imageData.registryType as "DOCKERHUB" | "GHCR" | "GITLAB" | "GENERIC" | "ECR" | "GCR" || undefined;
          }
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
    return apiError(error, 'Failed to start rescan');
  }
}