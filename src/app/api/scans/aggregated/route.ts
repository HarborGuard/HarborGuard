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
    
    // Process and serialize the data with actual vulnerability counting
    const serializedData = scans.map((scan: any) => {
      let vulnCount = { total: 0, critical: 0, high: 0, medium: 0, low: 0 }
      
      // Always parse actual metadata to get real vulnerability counts
      const scanResults = (scan.metadata as any)?.scanResults
      const trivyResults = scanResults?.trivy
      
      if (trivyResults?.Results) {
        // Parse all results to get accurate counts
        for (const result of trivyResults.Results) {
          if (result.Vulnerabilities && Array.isArray(result.Vulnerabilities)) {
            for (const vuln of result.Vulnerabilities) {
              const severity = (vuln.Severity || 'UNKNOWN').toUpperCase()
              
              switch (severity) {
                case 'CRITICAL':
                  vulnCount.critical++
                  break
                case 'HIGH':
                  vulnCount.high++
                  break
                case 'MEDIUM':
                  vulnCount.medium++
                  break
                case 'LOW':
                  vulnCount.low++
                  break
                case 'NEGLIGIBLE':
                case 'INFO':
                  vulnCount.low++
                  break
              }
              vulnCount.total++
            }
          }
        }
      }
      
      // Also check grype results if trivy didn't find anything
      if (vulnCount.total === 0) {
        const grypeResults = scanResults?.grype
        if (grypeResults?.matches) {
          for (const match of grypeResults.matches) {
            const severity = (match.vulnerability?.severity || 'UNKNOWN').toUpperCase()
            
            switch (severity) {
              case 'CRITICAL':
                vulnCount.critical++
                break
              case 'HIGH':
                vulnCount.high++
                break
              case 'MEDIUM':
                vulnCount.medium++
                break
              case 'LOW':
              case 'NEGLIGIBLE':
                vulnCount.low++
                break
            }
            vulnCount.total++
          }
        }
      }
      
      // Extract or calculate Dockle compliance grade
      let dockleGrade = null
      const dockleResults = scanResults?.dockle
      if (dockleResults?.summary) {
        const summary = dockleResults.summary
        // If grade exists, use it
        if (summary.grade) {
          dockleGrade = summary.grade
        } else if (typeof summary.fatal === 'number' && typeof summary.warn === 'number') {
          // Calculate grade based on fatal and warn counts
          const fatal = summary.fatal || 0
          const warn = summary.warn || 0
          const info = summary.info || 0
          
          if (fatal > 0) {
            dockleGrade = 'F'
          } else if (warn > 5) {
            dockleGrade = 'D'
          } else if (warn > 2) {
            dockleGrade = 'C'
          } else if (warn > 0 || info > 5) {
            dockleGrade = 'B'
          } else {
            dockleGrade = 'A'
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
        riskScore: scan.riskScore || 0,
        source: scan.source,
        image: {
          id: scan.image.id,
          name: scan.image.name,
          tag: scan.image.tag,
          registry: scan.image.registry,
          digest: scan.image.digest
        },
        vulnerabilityCount: vulnCount,
        complianceScore: scan.complianceScore,
        dockleGrade: dockleGrade
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