import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { prismaToScanWithImage, serializeScan } from '@/lib/type-utils'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    
    // First, get basic scan info with minimal joins
    let scan = await prisma.scan.findUnique({
      where: { id },
      include: {
        image: true,
        metadata: {
          select: {
            id: true,
            createdAt: true,
            updatedAt: true,
            // Aggregated vulnerability counts
            vulnerabilityCritical: true,
            vulnerabilityHigh: true,
            vulnerabilityMedium: true,
            vulnerabilityLow: true,
            vulnerabilityInfo: true,
            aggregatedRiskScore: true,
            // Compliance scores
            complianceScore: true,
            complianceGrade: true,
            complianceFatal: true,
            complianceWarn: true,
            complianceInfo: true,
            compliancePass: true,
            // Docker metadata
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
            scannerVersions: true
          }
        }
      }
    })
    
    if (!scan) {
      scan = await prisma.scan.findUnique({
        where: { requestId: id },
        include: {
          image: true,
          metadata: {
            select: {
              id: true,
              createdAt: true,
              updatedAt: true,
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
              scannerVersions: true
            }
          }
        }
      })
    }
    
    if (!scan) {
      return NextResponse.json(
        { error: 'Scan not found' },
        { status: 404 }
      )
    }
    
    if (!scan.metadata) {
      // No metadata, return basic scan info
      const scanData = prismaToScanWithImage(scan as any);
      return NextResponse.json(serializeScan(scanData))
    }
    
    const metadataId = scan.metadata.id
    
    // Parallel fetch all scanner results
    const [
      grypeResult,
      trivyResult,
      diveResult,
      syftResult,
      dockleResult,
      osvResult
    ] = await Promise.all([
      // Grype vulnerabilities
      prisma.grypeResults.findUnique({
        where: { scanMetadataId: metadataId },
        include: {
          vulnerabilities: {
            orderBy: { severity: 'desc' }
          }
        }
      }),
      
      // Trivy results
      prisma.trivyResults.findUnique({
        where: { scanMetadataId: metadataId },
        include: {
          vulnerabilities: {
            orderBy: { severity: 'desc' }
          },
          misconfigurations: {
            orderBy: { severity: 'desc' }
          },
          secrets: {
            orderBy: { severity: 'desc' }
          }
        }
      }),
      
      // Dive layers
      prisma.diveResults.findUnique({
        where: { scanMetadataId: metadataId },
        include: {
          layers: {
            orderBy: { layerIndex: 'asc' }
          }
        }
      }),
      
      // Syft packages (limited)
      prisma.syftResults.findUnique({
        where: { scanMetadataId: metadataId },
        include: {
          packages: {
            take: 100,
            orderBy: { name: 'asc' }
          }
        }
      }),
      
      // Dockle violations
      prisma.dockleResults.findUnique({
        where: { scanMetadataId: metadataId },
        include: {
          violations: {
            orderBy: { level: 'desc' }
          }
        }
      }),
      
      // OSV vulnerabilities
      prisma.osvResults.findUnique({
        where: { scanMetadataId: metadataId },
        include: {
          vulnerabilities: true
        }
      })
    ])
    
    // Add package count for Syft pagination
    let packagesPagination = null
    if (syftResult) {
      const totalPackages = await prisma.syftPackage.count({
        where: { syftResultsId: syftResult.id }
      })
      
      packagesPagination = {
        total: totalPackages,
        page: 0,
        limit: 100,
        pages: Math.ceil(totalPackages / 100)
      }
    }
    
    // Combine results
    const metadata = {
      ...scan.metadata,
      grypeResult,
      trivyResult,
      diveResult,
      syftResult: syftResult ? {
        ...syftResult,
        packagesPagination
      } : null,
      dockleResult,
      osvResult
    }
    
    const fullScan = {
      ...scan,
      metadata
    }
    
    // Convert and return
    const scanData = prismaToScanWithImage(fullScan as any);
    return NextResponse.json(serializeScan(scanData))
    
  } catch (error) {
    console.error('Error retrieving scan:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}