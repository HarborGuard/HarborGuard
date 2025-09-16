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
    const [scans, total, completedCount] = await Promise.all([
      prisma.scan.findMany({
        where,
        select: {
          id: true,
          requestId: true,
          imageId: true,
          tag: true,
          startedAt: true,
          finishedAt: true,
          status: true,
          riskScore: true,
          source: true,
          metadata: {
            select: {
              vulnerabilityCritical: true,
              vulnerabilityHigh: true,
              vulnerabilityMedium: true,
              vulnerabilityLow: true,
              vulnerabilityInfo: true,
              complianceGrade: true,
              complianceScore: true
            }
          },
          image: {
            select: {
              id: true,
              name: true,
              tag: true,
              source: true,
              digest: true,
              registry: true
            }
          },
          // Include vulnerability findings for accurate counting
          vulnerabilityFindings: {
            select: {
              cveId: true,
              severity: true,
              source: true
            }
          }
        },
        orderBy: { startedAt: 'desc' },
        take: limit,
        skip: offset
      }),
      prisma.scan.count({ where }),
      prisma.scan.count({ where: { ...where, status: 'SUCCESS' } })
    ])
    
    // Process and serialize the data with actual vulnerability counting
    const serializedData = await Promise.all(scans.map(async (scan: any) => {
      let vulnCount: any = { total: 0, critical: 0, high: 0, medium: 0, low: 0 }
      let dockleGrade = null
      
      // First try to get counts from metadata if available
      if (scan.metadata) {
        vulnCount.critical = scan.metadata.vulnerabilityCritical || 0
        vulnCount.high = scan.metadata.vulnerabilityHigh || 0
        vulnCount.medium = scan.metadata.vulnerabilityMedium || 0
        vulnCount.low = scan.metadata.vulnerabilityLow || 0
        vulnCount.info = scan.metadata.vulnerabilityInfo || 0
        vulnCount.total = vulnCount.critical + vulnCount.high + vulnCount.medium + vulnCount.low + (vulnCount.info || 0)
        dockleGrade = scan.metadata.complianceGrade
      } 
      
      // If no metadata or no findings in metadata, use normalized findings
      if (vulnCount.total === 0 && scan.vulnerabilityFindings && scan.vulnerabilityFindings.length > 0) {
        // Track unique CVEs and their highest severity
        const cveTracker = new Map<string, string>() // CVE ID -> highest severity
        
        // Helper function to get severity priority (higher number = higher severity)
        const getSeverityPriority = (severity: string) => {
          switch (severity) {
            case 'CRITICAL': return 4
            case 'HIGH': return 3
            case 'MEDIUM': return 2
            case 'LOW': 
            case 'INFO': return 1
            default: return 0
          }
        }
        
        // Process all vulnerability findings
        for (const finding of scan.vulnerabilityFindings) {
          const cveId = finding.cveId
          const severity = finding.severity
          
          // Track or update to highest severity
          const existingSeverity = cveTracker.get(cveId)
          if (!existingSeverity || getSeverityPriority(severity) > getSeverityPriority(existingSeverity)) {
            cveTracker.set(cveId, severity)
          }
        }
        
        // Now count all unique vulnerabilities using their highest severity
        vulnCount = { total: 0, critical: 0, high: 0, medium: 0, low: 0 }
        for (const [cveId, severity] of cveTracker.entries()) {
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
            case 'INFO':
              vulnCount.low++
              break
          }
          vulnCount.total++
        }
      }
      
      // If still no vulnerabilities but we have metadata JSON, fall back to JSON parsing
      if (vulnCount.total === 0 && scan.metadata) {
        const metadata = scan.metadata as any
        const scanResults = {
          trivy: metadata.trivyResults,
          grype: metadata.grypeResults
        }
        
        // Track unique CVEs and their highest severity
        const cveTracker = new Map<string, string>() // CVE ID -> highest severity
        
        // Helper function to get severity priority (higher number = higher severity)
        const getSeverityPriority = (severity: string) => {
          switch (severity.toUpperCase()) {
            case 'CRITICAL': return 4
            case 'HIGH': return 3
            case 'MEDIUM': return 2
            case 'LOW': 
            case 'NEGLIGIBLE':
            case 'INFO': return 1
            default: return 0
          }
        }
        
        // Process Trivy vulnerabilities
        const trivyResults = scanResults?.trivy
        if (trivyResults?.Results) {
          for (const result of trivyResults.Results) {
            if (result.Vulnerabilities && Array.isArray(result.Vulnerabilities)) {
              for (const vuln of result.Vulnerabilities) {
                const cveId = vuln.VulnerabilityID || vuln.PkgID || `trivy-${vuln.PkgName}-${vuln.InstalledVersion}`
                const severity = (vuln.Severity || 'UNKNOWN').toUpperCase()
                
                // Track or update to highest severity
                const existingSeverity = cveTracker.get(cveId)
                if (!existingSeverity || getSeverityPriority(severity) > getSeverityPriority(existingSeverity)) {
                  cveTracker.set(cveId, severity)
                }
              }
            }
          }
        }
        
        // Process Grype vulnerabilities
        const grypeResults = scanResults?.grype
        if (grypeResults?.matches) {
          for (const match of grypeResults.matches) {
            const cveId = match.vulnerability?.id || `grype-${match.artifact?.name}-${match.artifact?.version}`
            const severity = (match.vulnerability?.severity || 'UNKNOWN').toUpperCase()
            
            // Track or update to highest severity
            const existingSeverity = cveTracker.get(cveId)
            if (!existingSeverity || getSeverityPriority(severity) > getSeverityPriority(existingSeverity)) {
              cveTracker.set(cveId, severity)
            }
          }
        }
        
        // Now count all unique vulnerabilities using their highest severity
        for (const [cveId, severity] of cveTracker.entries()) {
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
            case 'INFO':
              vulnCount.low++
              break
          }
          vulnCount.total++
        }
        
        // Extract Dockle compliance grade if not already set
        if (!dockleGrade && metadata.dockleResults) {
          const dockleResults = metadata.dockleResults
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
        }
      }

      // Remove the vulnerabilityFindings from the response
      const { vulnerabilityFindings, ...scanWithoutFindings } = scan

      return {
        id: scanWithoutFindings.id,
        requestId: scanWithoutFindings.requestId,
        imageId: scanWithoutFindings.imageId,
        tag: scanWithoutFindings.tag,
        startedAt: scanWithoutFindings.startedAt,
        finishedAt: scanWithoutFindings.finishedAt,
        status: scanWithoutFindings.status,
        riskScore: scanWithoutFindings.riskScore || 0,
        source: scanWithoutFindings.source,
        image: scanWithoutFindings.image,
        vulnerabilityCount: vulnCount,
        complianceScore: scan.metadata?.complianceScore,
        dockleGrade: dockleGrade
      }
    }))
    
    return NextResponse.json({
      scans: serializedData,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
        completedCount
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