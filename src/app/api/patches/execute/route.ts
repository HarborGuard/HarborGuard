import { NextRequest, NextResponse } from 'next/server';
import { PatchExecutor } from '@/lib/patcher/PatchExecutor';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      sourceImageId, 
      scanId, 
      targetRegistry, 
      targetTag, 
      dryRun = false 
    } = body;
    
    if (!sourceImageId || !scanId) {
      return NextResponse.json(
        { error: 'Source image ID and scan ID are required' },
        { status: 400 }
      );
    }

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
    
    const executor = new PatchExecutor();
    const patchOperation = await executor.executePatch({
      sourceImageId,
      scanId,
      targetRegistry,
      targetTag,
      dryRun
    });
    
    return NextResponse.json({
      success: true,
      patchOperation
    });

  } catch (error) {
    logger.error('Failed to execute patch:', error);
    return NextResponse.json(
      { 
        error: 'Failed to execute patch',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}