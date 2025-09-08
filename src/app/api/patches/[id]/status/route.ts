import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const patchOperation = await prisma.patchOperation.findUnique({
      where: { id },
      include: {
        sourceImage: true,
        patchedImage: true,
        patchResults: {
          orderBy: { cveId: 'asc' }
        }
      }
    });

    if (!patchOperation) {
      return NextResponse.json(
        { error: 'Patch operation not found' },
        { status: 404 }
      );
    }

    // Calculate summary statistics
    const summary = {
      totalVulnerabilities: patchOperation.vulnerabilitiesCount,
      patchedSuccessfully: patchOperation.patchedCount,
      patchesFailed: patchOperation.failedCount,
      successRate: patchOperation.vulnerabilitiesCount > 0 
        ? (patchOperation.patchedCount / patchOperation.vulnerabilitiesCount * 100).toFixed(1)
        : 0,
      duration: patchOperation.completedAt && patchOperation.startedAt
        ? Math.round((patchOperation.completedAt.getTime() - patchOperation.startedAt.getTime()) / 1000)
        : null
    };

    return NextResponse.json({
      patchOperation,
      summary
    });

  } catch (error) {
    console.error('Failed to fetch patch operation status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch patch operation status' },
      { status: 500 }
    );
  }
}