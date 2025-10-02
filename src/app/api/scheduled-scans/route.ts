import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const enabled = searchParams.get('enabled')
    const source = searchParams.get('source')
    const limit = Math.min(parseInt(searchParams.get('limit') || '25'), 100)
    const offset = parseInt(searchParams.get('offset') || '0')

    const where: any = {}

    if (enabled !== null) {
      where.enabled = enabled === 'true'
    }

    if (source) {
      where.source = source
    }

    const [scheduledScans, total] = await Promise.all([
      prisma.scheduledScan.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          selectedImages: {
            select: {
              id: true,
              imageId: true,
              imageName: true,
              imageTag: true,
              registry: true,
            }
          },
          scanHistory: {
            take: 1,
            orderBy: { startedAt: 'desc' },
            select: {
              id: true,
              executionId: true,
              startedAt: true,
              completedAt: true,
              status: true,
              totalImages: true,
              scannedImages: true,
              failedImages: true,
            }
          },
          _count: {
            select: {
              selectedImages: true,
              scanHistory: true
            }
          }
        }
      }),
      prisma.scheduledScan.count({ where })
    ])

    return NextResponse.json({
      scheduledScans,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total
      }
    })
  } catch (error) {
    console.error('Error fetching scheduled scans:', error)
    return NextResponse.json(
      { error: 'Failed to fetch scheduled scans' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      name,
      description,
      schedule,
      enabled = true,
      imageSelectionMode,
      imagePattern,
      selectedImageIds = [],
      source = 'MANUAL'
    } = body

    // Validate required fields
    if (!name) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      )
    }

    if (!imageSelectionMode) {
      return NextResponse.json(
        { error: 'Image selection mode is required' },
        { status: 400 }
      )
    }

    // Validate pattern-based selection
    if (imageSelectionMode === 'PATTERN' && !imagePattern) {
      return NextResponse.json(
        { error: 'Image pattern is required for pattern-based selection' },
        { status: 400 }
      )
    }

    // Validate specific image selection
    if (imageSelectionMode === 'SPECIFIC' && (!selectedImageIds || selectedImageIds.length === 0)) {
      return NextResponse.json(
        { error: 'At least one image must be selected for specific selection mode' },
        { status: 400 }
      )
    }

    // Get image details for selected images
    let imagesToAdd: any[] = []
    if (imageSelectionMode === 'SPECIFIC' && selectedImageIds.length > 0) {
      const images = await prisma.image.findMany({
        where: {
          id: { in: selectedImageIds }
        },
        select: {
          id: true,
          name: true,
          tag: true,
          registry: true
        }
      })

      if (images.length !== selectedImageIds.length) {
        return NextResponse.json(
          { error: 'Some selected images were not found' },
          { status: 400 }
        )
      }

      imagesToAdd = images.map(img => ({
        imageId: img.id,
        imageName: img.name,
        imageTag: img.tag,
        registry: img.registry
      }))
    }

    // Calculate next run time if schedule is provided
    let nextRunAt = null
    if (schedule && enabled) {
      // TODO: Implement cron parsing to calculate next run time
      // For now, just set it to tomorrow
      nextRunAt = new Date()
      nextRunAt.setDate(nextRunAt.getDate() + 1)
    }

    // Create the scheduled scan
    const scheduledScan = await prisma.scheduledScan.create({
      data: {
        name,
        description,
        schedule,
        enabled,
        imageSelectionMode,
        imagePattern,
        source,
        nextRunAt,
        selectedImages: {
          create: imagesToAdd
        }
      },
      include: {
        selectedImages: true,
        _count: {
          select: {
            selectedImages: true
          }
        }
      }
    })

    return NextResponse.json(scheduledScan, { status: 201 })
  } catch (error) {
    console.error('Error creating scheduled scan:', error)
    return NextResponse.json(
      { error: 'Failed to create scheduled scan' },
      { status: 500 }
    )
  }
}