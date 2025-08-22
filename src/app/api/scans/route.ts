import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { prismaToScanWithImage, serializeScan } from '@/lib/type-utils'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const imageId = searchParams.get('imageId')
    const limit = Math.min(parseInt(searchParams.get('limit') || '25'), 100) // Cap at 100
    const offset = parseInt(searchParams.get('offset') || '0')
    const includeReports = searchParams.get('includeReports') === 'true'
    
    const where: any = {}
    
    if (status) {
      where.status = status.toUpperCase()
    }
    
    if (imageId) {
      where.imageId = imageId
    }
    
    // Selective field loading - exclude large JSON fields by default
    const selectFields = includeReports ? undefined : {
      id: true,
      requestId: true,
      imageId: true,
      startedAt: true,
      finishedAt: true,
      status: true,
      errorMessage: true,
      riskScore: true,
      reportsDir: true,
      createdAt: true,
      updatedAt: true,
      source: true,
      // Exclude large JSON fields: metadata
      image: {
        select: {
          id: true,
          name: true,
          tag: true,
          registry: true,
          digest: true,
          sizeBytes: true,
          createdAt: true,
          updatedAt: true
        }
      }
    }
    
    // Build query dynamically to avoid select/include conflict
    const scanQuery: any = {
      where,
      orderBy: {
        startedAt: 'desc'
      },
      take: limit,
      skip: offset
    }
    
    if (selectFields) {
      scanQuery.select = selectFields
    } else {
      scanQuery.include = {
        image: true
      }
    }
    
    const [scans, total] = await Promise.all([
      prisma.scan.findMany(scanQuery),
      prisma.scan.count({ where })
    ])
    
    // Convert Prisma data - handle different query structures
    const scansData = scans.map((scan: any) => {
      if (selectFields) {
        // When using select, convert manually
        return {
          ...scan,
          image: scan.image ? {
            ...scan.image,
            sizeBytes: scan.image.sizeBytes?.toString() || null
          } : undefined
        }
      } else {
        // When using include, use the helper function
        return prismaToScanWithImage(scan)
      }
    });
    
    return NextResponse.json({
      scans: selectFields ? scansData : serializeScan(scansData),
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total
      }
    })
  } catch (error) {
    console.error('Error retrieving scans:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}