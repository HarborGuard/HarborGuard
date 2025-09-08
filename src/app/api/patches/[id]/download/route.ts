import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import fs from 'fs/promises';
import path from 'path';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    // Get patch operation details
    const patchOperation = await prisma.patchOperation.findUnique({
      where: { id },
      include: {
        scan: true
      }
    });

    if (!patchOperation) {
      return NextResponse.json(
        { error: 'Patch operation not found' },
        { status: 404 }
      );
    }

    if (patchOperation.status !== 'COMPLETED') {
      return NextResponse.json(
        { error: 'Patch operation not completed' },
        { status: 400 }
      );
    }

    // Check if patched tar exists
    const workDir = process.env.SCANNER_WORKDIR || '/workspace';
    const patchedTarPath = path.join(
      workDir, 
      'reports', 
      patchOperation.scan.requestId, 
      'patched-image.tar'
    );

    try {
      await fs.access(patchedTarPath);
    } catch {
      return NextResponse.json(
        { error: 'Patched image tar not found' },
        { status: 404 }
      );
    }

    // Read the tar file
    const tarBuffer = await fs.readFile(patchedTarPath);

    // Return as downloadable file
    return new NextResponse(tarBuffer as any, {
      headers: {
        'Content-Type': 'application/x-tar',
        'Content-Disposition': `attachment; filename="patched-image-${id}.tar"`,
        'Content-Length': tarBuffer.length.toString()
      }
    });

  } catch (error) {
    console.error('Failed to download patched image:', error);
    return NextResponse.json(
      { error: 'Failed to download patched image' },
      { status: 500 }
    );
  }
}