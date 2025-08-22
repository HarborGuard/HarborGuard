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
          riskScore: true,
          source: true,
          metadata: true,
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
      // Extract vulnerability counts from scan metadata (like vulnerabilities API does)
      let vulnCount = { total: 0, critical: 0, high: 0, medium: 0, low: 0 }
      
      const scanResults = (scan.metadata as any)?.scanResults
      const trivyResults = scanResults?.trivy
      
      if (trivyResults?.Results) {
        for (const result of trivyResults.Results) {
          if (result.Vulnerabilities) {
            for (const vuln of result.Vulnerabilities) {
              const severity = (vuln.Severity || 'unknown').toLowerCase()
              
              if (severity === 'critical') vulnCount.critical++
              else if (severity === 'high') vulnCount.high++
              else if (severity === 'medium') vulnCount.medium++
              else if (severity === 'low' || severity === 'info') vulnCount.low++
              vulnCount.total++
            }
          }
        }
      }

      return {
        id: scan.id,
        requestId: scan.requestId,
        imageId: scan.imageId,
        startedAt: scan.startedAt,
        finishedAt: scan.finishedAt,
        status: scan.status,
        riskScore: scan.riskScore,
        source: scan.source,
        image: {
          id: scan.image.id,
          name: scan.image.name,
          tag: scan.image.tag,
          registry: scan.image.registry,
          digest: scan.image.digest
        },
        vulnerabilityCount: vulnCount,
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