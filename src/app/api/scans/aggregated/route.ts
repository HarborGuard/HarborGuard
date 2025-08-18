import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const imageId = searchParams.get('imageId')
    const limit = Math.min(parseInt(searchParams.get('limit') || '25'), 100)
    const offset = parseInt(searchParams.get('offset') || '0')
    
    const where: any = {}
    
    if (status) {
      where.status = status.toUpperCase()
    }
    
    if (imageId) {
      where.imageId = imageId
    }
    
    // Use regular Prisma queries for better reliability
    const [scans, total] = await Promise.all([
      prisma.scan.findMany({
        where,
        select: {
          id: true,
          requestId: true,
          imageId: true,
          startedAt: true,
          finishedAt: true,
          status: true,
          vulnerabilityCount: true,
          riskScore: true,
          complianceScore: true,
          source: true,
          image: {
            select: {
              id: true,
              name: true,
              tag: true,
              registry: true,
              digest: true
            }
          }
        },
        orderBy: { startedAt: 'desc' },
        take: limit,
        skip: offset
      }),
      prisma.scan.count({ where })
    ])
    
    // Process and serialize the data
    const serializedData = scans.map((scan: any) => {
      const vulnCount = scan.vulnerabilityCount || {}
      return {
        id: scan.id,
        requestId: scan.requestId,
        imageId: scan.imageId,
        startedAt: scan.startedAt,
        finishedAt: scan.finishedAt,
        status: scan.status,
        riskScore: scan.riskScore,
        source: scan.source,
        image: scan.image,
        vulnerabilityCount: {
          total: vulnCount.total || 0,
          critical: vulnCount.critical || 0,
          high: vulnCount.high || 0,
          medium: vulnCount.medium || 0,
          low: vulnCount.low || 0
        },
        complianceScore: scan.complianceScore
      }
    })
    
    return NextResponse.json({
      scans: serializedData,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total
      }
    })
  } catch (error) {
    console.error('Error retrieving aggregated scans:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}