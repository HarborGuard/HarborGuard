import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { randomUUID } from 'crypto'
import { scannerService } from '@/lib/scanner'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Get the scheduled scan
    const scheduledScan = await prisma.scheduledScan.findUnique({
      where: { id },
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
              registry: true,
              source: true,
              dockerImageId: true,
              primaryRepositoryId: true
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
            registry: true,
            source: true,
            dockerImageId: true,
            primaryRepositoryId: true
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
        scheduledScanId: id,
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
      where: { id },
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
    data: {
      status: 'RUNNING',
      startedAt: new Date()
    }
  })

  let scannedCount = 0
  let failedCount = 0
  const scanResults = []

  // Process each image
  for (const image of images) {
    try {
      // Create a scheduled scan result record
      const result = await prisma.scheduledScanResult.create({
        data: {
          history: {
            connect: {
              id: historyId
            }
          },
          imageId: image.id,
          imageName: image.name,
          imageTag: image.tag,
          status: 'PENDING',
          startedAt: new Date()
        }
      })

      // Trigger actual scan using the scanner service
      // Map LOCAL_DOCKER to 'local' for the scanner service
      const source = image.source === 'LOCAL_DOCKER' ? 'local' :
                     image.source === 'REGISTRY' ? 'registry' :
                     image.source || 'registry'

      const scanRequest = {
        image: image.name,
        tag: image.tag,
        source: source,
        dockerImageId: image.dockerImageId,
        repositoryId: image.primaryRepositoryId || image.repositoryId
      }

      const scanResponse = await scannerService.startScan(scanRequest)

      if (scanResponse.requestId) {
        // Link the scheduled scan result to the actual scan
        const scan = await prisma.scan.findUnique({
          where: { requestId: scanResponse.requestId }
        })

        if (scan) {
          await prisma.scheduledScanResult.update({
            where: { id: result.id },
            data: {
              scanId: scan.id,
              status: 'RUNNING'
            }
          })
          scanResults.push({ resultId: result.id, scanId: scan.id })
        }

        scannedCount++
      } else {
        // Scan failed to start
        await prisma.scheduledScanResult.update({
          where: { id: result.id },
          data: {
            status: 'FAILED',
            completedAt: new Date(),
            errorMessage: 'Failed to start scan'
          }
        })
        failedCount++
      }

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

  // Start monitoring scan completions
  monitorScanCompletion(historyId, scanResults).catch(console.error)

  // Update execution status based on initial results
  await prisma.scheduledScanHistory.update({
    where: { id: historyId },
    data: {
      status: failedCount === images.length ? 'FAILED' :
             scannedCount === 0 ? 'FAILED' : 'RUNNING',
      scannedImages: scannedCount,
      failedImages: failedCount
    }
  })
}

async function monitorScanCompletion(historyId: string, scanResults: any[]) {
  // Poll for scan completion (in production, use webhooks or queue)
  const maxAttempts = 180 // 15 minutes with 5-second intervals
  let attempts = 0

  const checkInterval = setInterval(async () => {
    attempts++

    try {
      // Check all scan results
      let allCompleted = true
      let completedCount = 0
      let failedCount = 0

      for (const { resultId, scanId } of scanResults) {
        const scan = await prisma.scan.findUnique({
          where: { id: scanId },
          include: {
            metadata: {
              select: {
                vulnerabilityCritical: true,
                vulnerabilityHigh: true,
                vulnerabilityMedium: true,
                vulnerabilityLow: true
              }
            }
          }
        })

        if (scan) {
          if (scan.status === 'SUCCESS' || scan.status === 'FAILED') {
            // Update scheduled scan result status (vulnerability data is referenced from the scan)
            await prisma.scheduledScanResult.update({
              where: { id: resultId },
              data: {
                status: scan.status === 'SUCCESS' ? 'SUCCESS' : 'FAILED',
                completedAt: new Date(),
                errorMessage: scan.status === 'FAILED' ? 'Scan failed' : null
              }
            })

            if (scan.status === 'SUCCESS') {
              completedCount++
            } else {
              failedCount++
            }
          } else {
            allCompleted = false
          }
        }
      }

      if (allCompleted || attempts >= maxAttempts) {
        clearInterval(checkInterval)

        // Get final counts
        const history = await prisma.scheduledScanHistory.findUnique({
          where: { id: historyId },
          include: {
            scanResults: {
              where: { status: { in: ['SUCCESS', 'FAILED'] } }
            }
          }
        })

        const successCount = history?.scanResults.filter(r => r.status === 'SUCCESS').length || 0
        const totalFailedCount = history?.scanResults.filter(r => r.status === 'FAILED').length || 0
        const totalImages = history?.totalImages || 0

        // Update final status
        await prisma.scheduledScanHistory.update({
          where: { id: historyId },
          data: {
            status: attempts >= maxAttempts ? 'FAILED' :
                   totalFailedCount === totalImages ? 'FAILED' :
                   totalFailedCount > 0 ? 'PARTIAL' : 'COMPLETED',
            completedAt: new Date(),
            scannedImages: successCount,
            failedImages: totalFailedCount,
            errorMessage: attempts >= maxAttempts ? 'Scan monitoring timeout after 15 minutes' : null
          }
        })
      }
    } catch (error) {
      console.error('Error monitoring scan completion:', error)
      clearInterval(checkInterval)
    }
  }, 5000) // Check every 5 seconds
}