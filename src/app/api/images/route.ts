/**
 * @swagger
 * /api/images:
 *   get:
 *     summary: List container images
 *     description: Retrieve a paginated list of scanned container images
 *     tags: [Images]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 25
 *         description: Number of images to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of images to skip
 *       - in: query
 *         name: includeScans
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Include scan history
 *       - in: query
 *         name: includeVulnerabilities
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Include vulnerability details
 *     responses:
 *       200:
 *         description: List of images retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 images:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Image'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     offset:
 *                       type: integer
 *                     hasMore:
 *                       type: boolean
 *       500:
 *         description: Internal server error
 */

import { NextRequest, NextResponse } from 'next/server';
import { DatabaseService } from '@/services/DatabaseService';
import { serializeForJson } from '@/lib/type-utils';

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

    return NextResponse.json(serializeForJson({
      images,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total
      }
    }));

  } catch (error) {
    console.error('Failed to fetch images:', error);
    return NextResponse.json(
      { error: 'Failed to fetch images' },
      { status: 500 }
    );
  }
}
