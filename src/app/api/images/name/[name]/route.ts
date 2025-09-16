import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auditLogger } from '@/lib/audit-logger'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params
    const { searchParams } = new URL(request.url)
    
    // Decode the image name in case it has special characters
    const decodedName = decodeURIComponent(name)
    
    // Pagination parameters
    const scanLimit = Math.min(parseInt(searchParams.get('scanLimit') || '10'), 50)
    const scanOffset = parseInt(searchParams.get('scanOffset') || '0')
    const includeReports = searchParams.get('includeReports') === 'true'
    
    // First get images metadata without scans
    const images = await prisma.image.findMany({
      where: { 
        name: decodedName 
      },
      select: {
        id: true,
        name: true,
        tag: true,
        source: true,
        digest: true,
        sizeBytes: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: [
        { tag: 'desc' }, // Show latest tags first
        { createdAt: 'desc' }
      ]
    })
    
    if (images.length === 0) {
      return NextResponse.json(
        { error: 'No images found with this name' },
        { status: 404 }
      )
    }
    
    const imageIds = images.map(img => img.id)
    
    // Get total scan count for pagination
    const totalScans = await prisma.scan.count({
      where: {
        imageId: { in: imageIds }
      }
    })
    
    // Selective field loading for scans - exclude large JSON reports by default
    const scanSelectFields = includeReports ? undefined : {
      id: true,
      requestId: true,
      imageId: true,
      startedAt: true,
      finishedAt: true,
      status: true,
      errorMessage: true,
      riskScore: true,
      createdAt: true,
      updatedAt: true,
      source: true,
      // Exclude large JSON fields: trivy, grype, syft, dockle, metadata, osv, dive
      image: {
        select: {
          id: true,
          name: true,
          tag: true,
          source: true,
          digest: true
        }
      }
    }
    
    // Get paginated scans with selective loading
    const scanQuery: any = {
      where: {
        imageId: { in: imageIds }
      },
      orderBy: { startedAt: 'desc' },
      take: scanLimit,
      skip: scanOffset
    }
    
    if (scanSelectFields) {
      scanQuery.select = scanSelectFields
    } else {
      scanQuery.include = {
        image: {
          select: {
            id: true,
            name: true,
            tag: true,
            source: true,
            digest: true
          }
        }
      }
    }
    
    const scans = await prisma.scan.findMany(scanQuery)
    
    // Convert BigInt to string for JSON serialization
    const serializedScans = scans.map((scan: any) => ({
      ...scan,
      image: scan.image ? {
        ...scan.image,
        sizeBytes: scan.image.sizeBytes?.toString() || null
      } : undefined
    }))
    
    // Get the most recent image info for the main display
    const latestImage = images[0]
    
    const serializedResponse = {
      name: decodedName,
      images: images.map(image => ({
        ...image,
        sizeBytes: image.sizeBytes?.toString() || null
      })),
      scans: serializedScans,
      latestImage: {
        ...latestImage,
        sizeBytes: latestImage.sizeBytes?.toString() || null
      },
      // Summary stats
      totalScans,
      tags: [...new Set(images.map(img => img.tag))].sort(),
      registries: [...new Set(images.map(img => img.source).filter(Boolean))],
      pagination: {
        limit: scanLimit,
        offset: scanOffset,
        total: totalScans,
        hasMore: scanOffset + scanLimit < totalScans
      }
    }
    
    return NextResponse.json(serializedResponse)
    
  } catch (error) {
    console.error('Error fetching image by name:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params
    
    // Decode the image name in case it has special characters
    const decodedName = decodeURIComponent(name)
    
    // Find all images with this name (across all tags and registries)
    const images = await prisma.image.findMany({
      where: { 
        name: decodedName 
      },
      include: {
        scans: true
      }
    })
    
    if (images.length === 0) {
      return NextResponse.json(
        { error: 'No images found with this name' },
        { status: 404 }
      )
    }
    
    // Delete all scans associated with these images first (due to foreign key constraints)
    const scanIds = images.flatMap(image => image.scans.map(scan => scan.id))
    
    if (scanIds.length > 0) {
      await prisma.scan.deleteMany({
        where: {
          id: {
            in: scanIds
          }
        }
      })
    }
    
    // Delete all CVE classifications for these images
    const imageIds = images.map(image => image.id)
    await prisma.cveClassification.deleteMany({
      where: {
        imageId: {
          in: imageIds
        }
      }
    })
    
    // Now delete the images themselves
    await prisma.image.deleteMany({
      where: {
        name: decodedName
      }
    })
    
    // Log the image deletion action
    await auditLogger.imageDelete(request, decodedName);
    
    return NextResponse.json({
      success: true,
      message: `Successfully deleted ${images.length} image(s) with name "${decodedName}" and ${scanIds.length} associated scan(s)`
    })
    
  } catch (error) {
    console.error('Error deleting image by name:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}