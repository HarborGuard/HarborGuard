import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const imageId = searchParams.get('imageId');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const whereClause = imageId 
      ? {
          OR: [
            { sourceImageId: imageId },
            { patchedImageId: imageId }
          ]
        }
      : {};

    const [operations, total] = await Promise.all([
      prisma.patchOperation.findMany({
        where: whereClause,
        include: {
          sourceImage: {
            select: {
              id: true,
              name: true,
              tag: true,
              source: true
            }
          },
          patchedImage: {
            select: {
              id: true,
              name: true,
              tag: true,
              source: true
            }
          },
          scan: {
            select: {
              id: true,
              requestId: true,
              startedAt: true
            }
          },
          _count: {
            select: {
              patchResults: true
            }
          }
        },
        orderBy: { startedAt: 'desc' },
        take: limit,
        skip: offset
      }),
      prisma.patchOperation.count({ where: whereClause })
    ]);

    // Add summary statistics to each operation
    const operationsWithStats = operations.map(op => ({
      ...op,
      stats: {
        totalPatches: op._count.patchResults,
        successRate: op.vulnerabilitiesCount > 0
          ? (op.patchedCount / op.vulnerabilitiesCount * 100).toFixed(1)
          : 0,
        duration: op.completedAt && op.startedAt
          ? Math.round((op.completedAt.getTime() - op.startedAt.getTime()) / 1000)
          : null
      }
    }));

    return NextResponse.json({
      operations: operationsWithStats,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total
      }
    });

  } catch (error) {
    console.error('Failed to fetch patch history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch patch history' },
      { status: 500 }
    );
  }
}