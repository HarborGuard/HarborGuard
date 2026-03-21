import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Cleanup endpoint: clears registry/registryType on LOCAL_DOCKER and FILE_UPLOAD images.
 * These fields should only be set for REGISTRY/REGISTRY_PRIVATE sources where
 * an actual repository connection was used. Image.source is the single source of truth.
 */
export async function POST() {
  try {
    // Clear registry/registryType on images where source is the authority (no registry connection)
    const result = await prisma.image.updateMany({
      where: {
        source: { in: ['LOCAL_DOCKER', 'FILE_UPLOAD'] },
        OR: [
          { registry: { not: null } },
          { registryType: { not: null } },
        ],
      },
      data: {
        registry: null,
        registryType: null,
      },
    });

    return NextResponse.json({
      success: true,
      cleaned: result.count,
    });
  } catch (error) {
    console.error('Registry cleanup error:', error);
    return NextResponse.json(
      { error: 'Failed to clean up registry data', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
