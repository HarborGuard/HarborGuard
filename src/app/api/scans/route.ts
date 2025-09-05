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
    
    // Selective field loading - always include metadata for vulnerability counts
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
      metadata: true, // Include metadata to calculate vulnerability counts
      scanMetadata: true, // Include new ScanMetadata table
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
        image: true,
        scanMetadata: true
      }
    }
    
    const [scans, total] = await Promise.all([
      prisma.scan.findMany(scanQuery),
      prisma.scan.count({ where })
    ])
    
    // Helper function to calculate vulnerability counts from metadata
    const calculateVulnerabilityCounts = (scan: any) => {
      const counts = { total: 0, critical: 0, high: 0, medium: 0, low: 0 };
      
      // Use new ScanMetadata if available, fallback to old metadata
      if (scan.scanMetadata) {
        // Use pre-calculated counts from ScanMetadata table
        counts.critical = scan.scanMetadata.vulnerabilityCritical || 0;
        counts.high = scan.scanMetadata.vulnerabilityHigh || 0;
        counts.medium = scan.scanMetadata.vulnerabilityMedium || 0;
        counts.low = scan.scanMetadata.vulnerabilityLow || 0;
        counts.total = counts.critical + counts.high + counts.medium + counts.low;
        return counts;
      }
      
      // Fallback to old metadata structure
      if (scan.metadata) {
        const metadata = scan.metadata as any;
        const scanResults = metadata?.scanResults;
        
        // Track unique CVEs to avoid double-counting
        const cveTracker = new Map<string, string>(); // CVE ID -> highest severity
        
        // Helper function to get severity priority
        const getSeverityPriority = (severity: string) => {
          switch (severity.toUpperCase()) {
            case 'CRITICAL': return 4;
            case 'HIGH': return 3;
            case 'MEDIUM': return 2;
            case 'LOW':
            case 'NEGLIGIBLE':
            case 'INFO': return 1;
            default: return 0;
          }
        };
        
        // Process Trivy results
        if (scanResults?.trivy?.Results) {
          for (const result of scanResults.trivy.Results) {
            if (result.Vulnerabilities && Array.isArray(result.Vulnerabilities)) {
              for (const vuln of result.Vulnerabilities) {
                const cveId = vuln.VulnerabilityID || vuln.PkgID || `trivy-${vuln.PkgName}-${vuln.InstalledVersion}`;
                const severity = (vuln.Severity || 'UNKNOWN').toUpperCase();
                
                const existingSeverity = cveTracker.get(cveId);
                if (!existingSeverity || getSeverityPriority(severity) > getSeverityPriority(existingSeverity)) {
                  cveTracker.set(cveId, severity);
                }
              }
            }
          }
        }
        
        // Process Grype results
        if (scanResults?.grype?.matches) {
          for (const match of scanResults.grype.matches) {
            const cveId = match.vulnerability?.id || `grype-${match.artifact?.name}-${match.artifact?.version}`;
            const severity = (match.vulnerability?.severity || 'UNKNOWN').toUpperCase();
            
            const existingSeverity = cveTracker.get(cveId);
            if (!existingSeverity || getSeverityPriority(severity) > getSeverityPriority(existingSeverity)) {
              cveTracker.set(cveId, severity);
            }
          }
        }
        
        // Count vulnerabilities using highest severity
        for (const [cveId, severity] of cveTracker.entries()) {
          switch (severity) {
            case 'CRITICAL':
              counts.critical++;
              break;
            case 'HIGH':
              counts.high++;
              break;
            case 'MEDIUM':
              counts.medium++;
              break;
            case 'LOW':
            case 'NEGLIGIBLE':
            case 'INFO':
              counts.low++;
              break;
          }
          counts.total++;
        }
      }
      
      return counts;
    };
    
    // Helper function to calculate Dockle compliance grade
    const calculateDockleGrade = (scan: any) => {
      // Use new ScanMetadata if available
      if (scan.scanMetadata) {
        return scan.scanMetadata.complianceGrade || null;
      }
      
      // Fallback to old metadata structure
      if (scan.metadata) {
        const metadata = scan.metadata as any;
        const dockleResults = metadata?.scanResults?.dockle;
        
        if (dockleResults?.summary) {
          const summary = dockleResults.summary;
          // If grade exists, use it
          if (summary.grade) {
            return summary.grade;
          }
          // Calculate grade based on fatal and warn counts
          const fatal = summary.fatal || 0;
          const warn = summary.warn || 0;
          const info = summary.info || 0;
          
          if (fatal > 0) {
            return 'F';
          } else if (warn > 5) {
            return 'D';
          } else if (warn > 2) {
            return 'C';
          } else if (warn > 0 || info > 5) {
            return 'B';
          } else {
            return 'A';
          }
        }
      }
      return null;
    };
    
    // Convert Prisma data - handle different query structures
    const scansData = scans.map((scan: any) => {
      const baseData = selectFields ? {
        ...scan,
        image: scan.image ? {
          ...scan.image,
          sizeBytes: scan.image.sizeBytes?.toString() || null
        } : undefined
      } : prismaToScanWithImage(scan);
      
      // Add vulnerability counts and Dockle grade if metadata is available
      const vulnerabilityCount = calculateVulnerabilityCounts(scan);
      const dockleGrade = calculateDockleGrade(scan);
      
      return {
        ...baseData,
        vulnerabilityCount,
        dockleGrade
      };
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