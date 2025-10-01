import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const scheduledScan = await prisma.scheduledScan.findUnique({
      where: { id: params.id },
      include: {
        selectedImages: {
          include: {
            image: {
              select: {
                id: true,
                name: true,
                tag: true,
                registry: true,
                digest: true,
                sizeBytes: true
              }
            }
          }
        },
        scanHistory: {
          orderBy: { startedAt: 'desc' },
          take: 10,
          include: {
            scanResults: {
              select: {
                id: true,
                scanId: true,
                imageId: true,
                imageName: true,
                imageTag: true,
                status: true,
                startedAt: true,
                completedAt: true,
                vulnerabilityCritical: true,
                vulnerabilityHigh: true,
                vulnerabilityMedium: true,
                vulnerabilityLow: true,
                errorMessage: true
              }
            },
            _count: {
              select: {
                scanResults: true
              }
            }
          }
        },
        _count: {
          select: {
            selectedImages: true,
            scanHistory: true
          }
        }
      }
    })

    if (!scheduledScan) {
      return NextResponse.json(
        { error: 'Scheduled scan not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(scheduledScan)
  } catch (error) {
    console.error('Error fetching scheduled scan:', error)
    return NextResponse.json(
      { error: 'Failed to fetch scheduled scan' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json()
    const {
      name,
      description,
      schedule,
      enabled,
      imageSelectionMode,
      imagePattern,
      selectedImageIds
    } = body

    // Check if scheduled scan exists
    const existingScan = await prisma.scheduledScan.findUnique({
      where: { id: params.id },
      include: {
        selectedImages: true
      }
    })

    if (!existingScan) {
      return NextResponse.json(
        { error: 'Scheduled scan not found' },
        { status: 404 }
      )
    }

    // Build update data
    const updateData: any = {}

    if (name !== undefined) updateData.name = name
    if (description !== undefined) updateData.description = description
    if (schedule !== undefined) updateData.schedule = schedule
    if (enabled !== undefined) updateData.enabled = enabled
    if (imageSelectionMode !== undefined) updateData.imageSelectionMode = imageSelectionMode
    if (imagePattern !== undefined) updateData.imagePattern = imagePattern

    // Calculate next run time if schedule changed and enabled
    if (schedule !== undefined && enabled) {
      // TODO: Implement proper cron parsing
      const nextRunAt = new Date()
      nextRunAt.setDate(nextRunAt.getDate() + 1)
      updateData.nextRunAt = nextRunAt
    } else if (!enabled) {
      updateData.nextRunAt = null
    }

    // Handle image selection updates
    if (selectedImageIds !== undefined) {
      // Delete existing selections
      await prisma.scheduledScanImage.deleteMany({
        where: { scheduledScanId: params.id }
      })

      // Add new selections
      if (selectedImageIds.length > 0) {
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

        await prisma.scheduledScanImage.createMany({
          data: images.map(img => ({
            scheduledScanId: params.id,
            imageId: img.id,
            imageName: img.name,
            imageTag: img.tag,
            registry: img.registry
          }))
        })
      }
    }

    // Update the scheduled scan
    const updatedScan = await prisma.scheduledScan.update({
      where: { id: params.id },
      data: updateData,
      include: {
        selectedImages: true,
        _count: {
          select: {
            selectedImages: true,
            scanHistory: true
          }
        }
      }
    })

    return NextResponse.json(updatedScan)
  } catch (error) {
    console.error('Error updating scheduled scan:', error)
    return NextResponse.json(
      { error: 'Failed to update scheduled scan' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Check if scheduled scan exists
    const existingScan = await prisma.scheduledScan.findUnique({
      where: { id: params.id }
    })

    if (!existingScan) {
      return NextResponse.json(
        { error: 'Scheduled scan not found' },
        { status: 404 }
      )
    }

    // Delete the scheduled scan (cascades to related records)
    await prisma.scheduledScan.delete({
      where: { id: params.id }
    })

    return NextResponse.json({ message: 'Scheduled scan deleted successfully' })
  } catch (error) {
    console.error('Error deleting scheduled scan:', error)
    return NextResponse.json(
      { error: 'Failed to delete scheduled scan' },
      { status: 500 }
    )
  }
}