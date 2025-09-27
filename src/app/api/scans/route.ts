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
    const fields = searchParams.get('fields')?.split(',').filter(Boolean) // Support ?fields=id,status,vulnerabilityCount
    
    const where: any = {}
    
    if (status) {
      where.status = status.toUpperCase()
    }
    
    if (imageId) {
      where.imageId = imageId
    }
    
    // Build select fields based on request
    let selectFields: any = undefined;

    // If specific fields are requested, build minimal select
    if (fields && fields.length > 0) {
      selectFields = {
        id: true, // Always include ID
      };

      // Map requested fields to database fields
      fields.forEach(field => {
        switch(field) {
          case 'status':
          case 'requestId':
          case 'imageId':
          case 'tag':
          case 'startedAt':
          case 'finishedAt':
          case 'errorMessage':
          case 'riskScore':
          case 'reportsDir':
          case 'createdAt':
          case 'updatedAt':
          case 'source':
            selectFields[field] = true;
            break;
          case 'vulnerabilityCount':
            // Include minimal metadata for counts
            selectFields.metadata = {
              select: {
                vulnerabilityCritical: true,
                vulnerabilityHigh: true,
                vulnerabilityMedium: true,
                vulnerabilityLow: true,
                vulnerabilityInfo: true,
              }
            };
            break;
          case 'image':
            selectFields.image = {
              select: {
                id: true,
                name: true,
                tag: true,
                digest: true,
              }
            };
            break;
          case 'compliance':
            if (!selectFields.metadata) {
              selectFields.metadata = { select: {} };
            }
            selectFields.metadata.select.complianceGrade = true;
            selectFields.metadata.select.complianceScore = true;
            break;
        }
      });
    }
    // Default selective field loading - only include vulnerability counts, not full metadata
    else if (!includeReports) {
      selectFields = {
      id: true,
      requestId: true,
      imageId: true,
      tag: true,
      startedAt: true,
      finishedAt: true,
      status: true,
      errorMessage: true,
      riskScore: true,
      reportsDir: true,
      createdAt: true,
      updatedAt: true,
      source: true,
      metadata: {
        select: {
          id: true,
          vulnerabilityCritical: true,
          vulnerabilityHigh: true,
          vulnerabilityMedium: true,
          vulnerabilityLow: true,
          vulnerabilityInfo: true,
          complianceGrade: true,
          complianceScore: true,
          aggregatedRiskScore: true,
          dockerSize: true,
          // Explicitly exclude large scanner result fields
          // NOT including: trivyResults, grypeResults, syftResults, diveResults, osvResults, dockleResults
        }
      },
      image: {
        select: {
          id: true,
          name: true,
          tag: true,
          source: true,
          digest: true,
          sizeBytes: true,
          platform: true,
          primaryRepositoryId: true,
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
      // Even with includeReports, don't include full scanner results - those should be fetched separately
      scanQuery.include = {
        image: true,
        metadata: {
          select: {
            id: true,
            vulnerabilityCritical: true,
            vulnerabilityHigh: true,
            vulnerabilityMedium: true,
            vulnerabilityLow: true,
            vulnerabilityInfo: true,
            complianceGrade: true,
            complianceScore: true,
            complianceFatal: true,
            complianceWarn: true,
            complianceInfo: true,
            compliancePass: true,
            aggregatedRiskScore: true,
            dockerSize: true,
            dockerOs: true,
            dockerArchitecture: true,
            dockerCreated: true,
            dockerAuthor: true,
            scannerVersions: true,
            // Still excluding massive fields: trivyResults, grypeResults, syftResults, diveResults, osvResults
          }
        }
      }
    }
    
    const [scans, total] = await Promise.all([
      prisma.scan.findMany(scanQuery),
      prisma.scan.count({ where })
    ])
    
    // Helper function to calculate vulnerability counts from metadata
    const calculateVulnerabilityCounts = (scan: any) => {
      const counts = { total: 0, critical: 0, high: 0, medium: 0, low: 0 };
      
      // Use ScanMetadata if available
      if (scan.metadata) {
        // Use pre-calculated counts from ScanMetadata table
        counts.critical = scan.metadata.vulnerabilityCritical || 0;
        counts.high = scan.metadata.vulnerabilityHigh || 0;
        counts.medium = scan.metadata.vulnerabilityMedium || 0;
        counts.low = scan.metadata.vulnerabilityLow || 0;
        counts.total = counts.critical + counts.high + counts.medium + counts.low;
      }
      
      return counts;
    };
    
    // Helper function to calculate Dockle compliance grade
    const calculateDockleGrade = (scan: any) => {
      // Use ScanMetadata if available
      if (scan.metadata) {
        return scan.metadata.complianceGrade || null;
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
        } : undefined,
        // Handle metadata BigInt serialization
        metadata: scan.metadata ? {
          ...scan.metadata,
          dockerSize: scan.metadata.dockerSize?.toString() || null
        } : null
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
      scans: serializeScan(scansData),
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