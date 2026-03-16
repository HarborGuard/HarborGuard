import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { PatchExecutor } from '@/lib/patcher/PatchExecutor';
import { PatchExecutorTar } from '@/lib/patcher/PatchExecutorTar';
import { PatchExecutorTarUnshare } from '@/lib/patcher/PatchExecutorTarUnshare';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { apiError } from '@/lib/api/api-utils';

const ExecutePatchSchema = z.object({
  sourceImageId: z.string().min(1),
  scanId: z.string().min(1),
  targetRegistry: z.string().optional(),
  targetTag: z.string().optional(),
  dryRun: z.boolean().optional().default(false),
  selectedVulnerabilityIds: z.array(z.string()).optional(),
  newImageName: z.string().optional(),
  newImageTag: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = ExecutePatchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues },
        { status: 400 }
      );
    }

    const {
      sourceImageId,
      scanId,
      targetRegistry,
      targetTag,
      dryRun,
      selectedVulnerabilityIds,
      newImageName,
      newImageTag
    } = parsed.data;

    // Verify image and scan exist
    const image = await prisma.image.findUnique({
      where: { id: sourceImageId }
    });

    if (!image) {
      return NextResponse.json(
        { error: 'Image not found' },
        { status: 404 }
      );
    }

    const scan = await prisma.scan.findUnique({
      where: { id: scanId }
    });

    if (!scan) {
      return NextResponse.json(
        { error: 'Scan not found' },
        { status: 404 }
      );
    }

    if (scan.imageId !== sourceImageId) {
      return NextResponse.json(
        { error: 'Scan does not belong to the specified image' },
        { status: 400 }
      );
    }

    logger.info(`Executing patch for image ${sourceImageId} based on scan ${scanId}`);
    
    // Use unshare tar-based executor for rootless buildah operations
    const executor = new PatchExecutorTarUnshare();
    const patchOperation = await executor.executePatch({
      sourceImageId,
      scanId,
      targetRegistry,
      targetTag: newImageTag || targetTag,
      dryRun,
      selectedVulnerabilityIds,
      newImageName,
      newImageTag
    });
    
    return NextResponse.json({
      success: true,
      patchOperation
    });

  } catch (error) {
    return apiError(error, 'Failed to execute patch');
  }
}