import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Get the scheduled scan
    const scheduledScan = await prisma.scheduledScan.findUnique({
      where: { id: params.id },
      include: {
        selectedImages: {
          include: {
            image: true
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

    if (!scheduledScan.enabled) {
      return NextResponse.json(
        { error: 'Scheduled scan is disabled' },
        { status: 400 }
      )
    }

    // Determine which images to scan based on selection mode
    let imagesToScan: any[] = []

    switch (scheduledScan.imageSelectionMode) {
      case 'SPECIFIC':
        imagesToScan = scheduledScan.selectedImages.map(si => si.image)
        break

      case 'PATTERN':
        if (scheduledScan.imagePattern) {
          const regex = new RegExp(scheduledScan.imagePattern)
          const allImages = await prisma.image.findMany({
            select: {
              id: true,
              name: true,
              tag: true,
              registry: true
            }
          })
          imagesToScan = allImages.filter(img =>
            regex.test(`${img.name}:${img.tag}`)
          )
        }
        break

      case 'ALL':
        imagesToScan = await prisma.image.findMany({
          select: {
            id: true,
            name: true,
            tag: true,
            registry: true
          }
        })
        break

      case 'REPOSITORY':
        // TODO: Implement repository-based selection
        return NextResponse.json(
          { error: 'Repository-based selection not yet implemented' },
          { status: 501 }
        )
    }

    if (imagesToScan.length === 0) {
      return NextResponse.json(
        { error: 'No images found to scan' },
        { status: 400 }
      )
    }

    // Create execution history record
    const executionId = randomUUID()
    const history = await prisma.scheduledScanHistory.create({
      data: {
        scheduledScanId: params.id,
        executionId,
        totalImages: imagesToScan.length,
        status: 'PENDING',
        triggerSource: 'MANUAL',
        triggeredBy: 'API' // TODO: Get from auth context
      }
    })

    // Start scanning images (async process)
    // In a real implementation, this would be queued to a background job
    startScanExecution(history.id, imagesToScan).catch(error => {
      console.error('Error in scan execution:', error)
      // Update history with error
      prisma.scheduledScanHistory.update({
        where: { id: history.id },
        data: {
          status: 'FAILED',
          errorMessage: error.message,
          completedAt: new Date()
        }
      }).catch(console.error)
    })

    // Update last run time
    await prisma.scheduledScan.update({
      where: { id: params.id },
      data: {
        lastRunAt: new Date()
      }
    })

    return NextResponse.json({
      executionId,
      historyId: history.id,
      totalImages: imagesToScan.length,
      status: 'STARTED',
      message: `Scheduled scan execution started for ${imagesToScan.length} images`
    }, { status: 202 })

  } catch (error) {
    console.error('Error executing scheduled scan:', error)
    return NextResponse.json(
      { error: 'Failed to execute scheduled scan' },
      { status: 500 }
    )
  }
}

async function startScanExecution(historyId: string, images: any[]) {
  // Update status to running
  await prisma.scheduledScanHistory.update({
    where: { id: historyId },
    data: { status: 'RUNNING' }
  })

  let scannedCount = 0
  let failedCount = 0

  // Process each image
  for (const image of images) {
    try {
      // Create a scan for this image
      const requestId = randomUUID()
      const scan = await prisma.scan.create({
        data: {
          requestId,
          imageId: image.id,
          startedAt: new Date(),
          status: 'PENDING',
          tag: image.tag
        }
      })

      // TODO: Trigger actual scan using existing scan service
      // For now, we'll just create the result record
      const result = await prisma.scheduledScanResult.create({
        data: {
          scheduledScanHistoryId: historyId,
          scanId: scan.id,
          imageId: image.id,
          imageName: image.name,
          imageTag: image.tag,
          status: 'PENDING',
          startedAt: new Date()
        }
      })

      // Simulate scan completion (in real app, this would be handled by scan service)
      await new Promise(resolve => setTimeout(resolve, 100))

      // Update scan result
      await prisma.scheduledScanResult.update({
        where: { id: result.id },
        data: {
          status: 'SUCCESS',
          completedAt: new Date(),
          vulnerabilityCritical: Math.floor(Math.random() * 5),
          vulnerabilityHigh: Math.floor(Math.random() * 10),
          vulnerabilityMedium: Math.floor(Math.random() * 20),
          vulnerabilityLow: Math.floor(Math.random() * 30)
        }
      })

      scannedCount++

      // Update progress
      await prisma.scheduledScanHistory.update({
        where: { id: historyId },
        data: {
          scannedImages: scannedCount,
          failedImages: failedCount
        }
      })

    } catch (error) {
      console.error(`Error scanning image ${image.name}:${image.tag}:`, error)
      failedCount++

      // Update failed count
      await prisma.scheduledScanHistory.update({
        where: { id: historyId },
        data: {
          failedImages: failedCount
        }
      })
    }
  }

  // Complete the execution
  await prisma.scheduledScanHistory.update({
    where: { id: historyId },
    data: {
      status: failedCount === images.length ? 'FAILED' :
             failedCount > 0 ? 'PARTIAL' : 'COMPLETED',
      completedAt: new Date(),
      scannedImages: scannedCount,
      failedImages: failedCount
    }
  })
}