import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { prismaToScanWithImage, serializeScan } from '@/lib/type-utils'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const includeJsonb = searchParams.get('includeJsonb') === 'true'
    const packageLimit = parseInt(searchParams.get('packageLimit') || '100')
    const packagePage = parseInt(searchParams.get('packagePage') || '0')
    
    // Build metadata select/include based on query params
    const metadataQuery = includeJsonb ? {
      include: {
        grypeResult: {
          include: {
            vulnerabilities: true
          }
        },
        trivyResult: {
          include: {
            vulnerabilities: true,
            misconfigurations: true,
            secrets: true
          }
        },
        diveResult: {
          include: {
            layers: true
          }
        },
        syftResult: {
          include: {
            packages: {
              take: packageLimit,
              skip: packagePage * packageLimit,
              orderBy: { name: 'asc' as const }
            }
          }
        },
        dockleResult: {
          include: {
            violations: true
          }
        },
        osvResult: {
          include: {
            vulnerabilities: true
          }
        }
      }
    } : {
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        // Exclude JSONB fields by not selecting them
        trivyResults: false,
        grypeResults: false,
        syftResults: false,
        dockleResults: false,
        osvResults: false,
        diveResults: false,
        // Include all other metadata fields
        vulnerabilityCritical: true,
        vulnerabilityHigh: true,
        vulnerabilityMedium: true,
        vulnerabilityLow: true,
        vulnerabilityInfo: true,
        aggregatedRiskScore: true,
        complianceScore: true,
        complianceGrade: true,
        complianceFatal: true,
        complianceWarn: true,
        complianceInfo: true,
        compliancePass: true,
        scannerVersions: true,
        dockerId: true,
        dockerCreated: true,
        dockerSize: true,
        dockerArchitecture: true,
        dockerOs: true,
        dockerVersion: true,
        dockerComment: true,
        dockerDigest: true,
        dockerConfig: true,
        dockerMetadata: true,
        dockerRepoTags: true,
        dockerRepoDigests: true,
        dockerEnv: true,
        dockerLabels: true,
        dockerAuthor: true,
        dockerParent: true,
        dockerGraphDriver: true,
        dockerRootFS: true,
        // Include table relations
        grypeResult: {
          include: {
            vulnerabilities: true
          }
        },
        trivyResult: {
          include: {
            vulnerabilities: true,
            misconfigurations: true,
            secrets: true
          }
        },
        diveResult: {
          include: {
            layers: true
          }
        },
        syftResult: {
          include: {
            packages: {
              take: packageLimit,
              skip: packagePage * packageLimit,
              orderBy: { name: 'asc' as const }
            }
          }
        },
        dockleResult: {
          include: {
            violations: true
          }
        },
        osvResult: {
          include: {
            vulnerabilities: true
          }
        }
      }
    }
    
    // Try to find by ID first, then by requestId
    let scan = await prisma.scan.findUnique({
      where: { id },
      include: {
        image: true,
        metadata: metadataQuery
      }
    })
    
    if (!scan) {
      scan = await prisma.scan.findUnique({
        where: { requestId: id },
        include: {
          image: true,
          metadata: metadataQuery
        }
      })
    }
    
    if (!scan) {
      return NextResponse.json(
        { error: 'Scan not found' },
        { status: 404 }
      )
    }
    
    // Add package pagination info if syftResult exists
    if (scan.metadata && 'syftResult' in scan.metadata && scan.metadata.syftResult) {
      // Get total package count for pagination
      const totalPackages = await prisma.syftPackage.count({
        where: { syftResultsId: scan.metadata.syftResult.id }
      });
      
      // Add pagination metadata
      (scan.metadata.syftResult as any).packagesPagination = {
        total: totalPackages,
        page: packagePage,
        limit: packageLimit,
        pages: Math.ceil(totalPackages / packageLimit)
      };
    }
    
    // Convert Prisma data to properly typed scan
    const scanData = prismaToScanWithImage(scan);
    
    return NextResponse.json(serializeScan(scanData))
  } catch (error) {
    console.error('Error retrieving scan:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const updates = await request.json()
    
    // Find scan by ID or requestId
    let scan = await prisma.scan.findUnique({ where: { id } })
    if (!scan) {
      scan = await prisma.scan.findUnique({ where: { requestId: id } })
    }
    
    if (!scan) {
      return NextResponse.json(
        { error: 'Scan not found' },
        { status: 404 }
      )
    }
    
    // Update scan
    const updatedScan = await prisma.scan.update({
      where: { id: scan.id },
      data: {
        ...updates,
        updatedAt: new Date()
      },
      include: {
        image: true,
        metadata: true
      }
    })
    
    // Convert Prisma data to properly typed scan
    const scanData = prismaToScanWithImage(updatedScan);
    
    return NextResponse.json(serializeScan(scanData))
  } catch (error) {
    console.error('Error updating scan:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    
    // Find scan by ID or requestId
    let scan = await prisma.scan.findUnique({ where: { id } })
    if (!scan) {
      scan = await prisma.scan.findUnique({ where: { requestId: id } })
    }
    
    if (!scan) {
      return NextResponse.json(
        { error: 'Scan not found' },
        { status: 404 }
      )
    }
    
    // Delete the scan and all related data (Prisma will handle cascading)
    await prisma.scan.delete({
      where: { id: scan.id }
    })
    
    return NextResponse.json(
      { success: true, message: 'Scan deleted successfully' },
      { status: 200 }
    )
  } catch (error) {
    console.error('Error deleting scan:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}