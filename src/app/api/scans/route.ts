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
      metadata: true, // Include ScanMetadata via foreign key
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
      scanQuery.include = {
        image: true,
        metadata: true
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