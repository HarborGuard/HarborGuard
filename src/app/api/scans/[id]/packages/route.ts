import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '0')
    const limit = parseInt(searchParams.get('limit') || '100')
    const search = searchParams.get('search') || ''
    
    // Find scan and get metadata ID
    let scan = await prisma.scan.findUnique({
      where: { id },
      select: {
        metadataId: true
      }
    })
    
    if (!scan) {
      scan = await prisma.scan.findUnique({
        where: { requestId: id },
        select: {
          metadataId: true
        }
      })
    }
    
    if (!scan?.metadataId) {
      return NextResponse.json(
        { error: 'Scan not found' },
        { status: 404 }
      )
    }
    
    // Get the Syft result ID
    const syftResult = await prisma.syftResults.findUnique({
      where: { scanMetadataId: scan.metadataId },
      select: { id: true }
    })
    
    if (!syftResult) {
      return NextResponse.json(
        { error: 'Syft results not found' },
        { status: 404 }
      )
    }
    
    const syftResultId = syftResult.id
    
    // Build where clause for search
    const whereClause: any = { syftResultsId: syftResultId }
    if (search) {
      whereClause.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { version: { contains: search, mode: 'insensitive' } },
        { type: { contains: search, mode: 'insensitive' } }
      ]
    }
    
    // Get total count for pagination
    const total = await prisma.syftPackage.count({ where: whereClause })
    
    // Get paginated packages
    const packages = await prisma.syftPackage.findMany({
      where: whereClause,
      skip: page * limit,
      take: limit,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        packageId: true,
        name: true,
        version: true,
        type: true,
        foundBy: true,
        purl: true,
        cpe: true,
        language: true,
        licenses: true,
        size: true,
        locations: true,
        layerId: true
        // Exclude metadata JSONB field for performance
      }
    })
    
    // Convert BigInt fields to strings for JSON serialization
    const serializedPackages = packages.map(pkg => ({
      ...pkg,
      size: pkg.size ? pkg.size.toString() : null
    }))
    
    return NextResponse.json({
      packages: serializedPackages,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
        hasMore: (page + 1) * limit < total
      }
    })
  } catch (error) {
    console.error('Error fetching packages:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}