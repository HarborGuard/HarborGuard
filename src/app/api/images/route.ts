import { NextRequest, NextResponse } from 'next/server';
import { DatabaseService } from '@/services/DatabaseService';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '25');
    const offset = parseInt(searchParams.get('offset') || '0');
    const includeScans = searchParams.get('includeScans') === 'true';
    const includeVulnerabilities = searchParams.get('includeVulnerabilities') === 'true';

    const db = new DatabaseService();
    
    const { images, total } = await db.getImages({
      limit,
      offset,
      includeScans,
      includeVulnerabilities
    });

    return NextResponse.json({
      images,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total
      }
    });

  } catch (error) {
    console.error('Failed to fetch images:', error);
    return NextResponse.json(
      { error: 'Failed to fetch images' },
      { status: 500 }
    );
  }
}