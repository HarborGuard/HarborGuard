import { NextRequest, NextResponse } from 'next/server'
import { scannerService } from '@/lib/scanner'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

export async function GET(request: NextRequest) {
  try {
    const jobs = scannerService.getAllJobs()
    const queuedScans = scannerService.getQueuedScans()
    const queueStats = scannerService.getQueueStats()

    // If no jobs and no queued scans, return early
    if (jobs.length === 0 && queuedScans.length === 0) {
      return NextResponse.json({
        jobs: [],
        queuedScans: [],
        queueStats: queueStats
      })
    }
    
    // Batch query all images at once instead of individual queries
    const imageIds = jobs.map(job => job.imageId).filter(Boolean)
    const images = imageIds.length > 0 
      ? await prisma.image.findMany({
          where: { id: { in: imageIds } },
          select: { id: true, name: true, tag: true }
        })
      : []
    
    // Create a lookup map for O(1) image lookups
    const imageMap = new Map(images.map(img => [img.id, img]))
    
    // Map jobs with image info
    const jobsWithImageInfo = jobs.map((job) => {
      const image = imageMap.get(job.imageId)
      return {
        requestId: job.requestId,
        scanId: job.scanId,
        imageId: job.imageId,
        imageName: image ? `${image.name}:${image.tag}` : job.imageId,
        status: job.status,
        progress: job.progress,
        error: job.error
      }
    })
    
    // Process queued scans if any
    const queuedScansWithInfo = queuedScans.map(scan => ({
      requestId: scan.requestId,
      scanId: scan.scanId,
      imageId: scan.imageId,
      imageName: `${scan.request.image}:${scan.request.tag}`,
      status: 'QUEUED',
      queuePosition: scannerService.getQueuePosition(scan.requestId),
      estimatedWaitTime: scannerService.getEstimatedWaitTime(scan.requestId)
    }))

    logger.debug(`Retrieved ${jobs.length} running jobs, ${queuedScans.length} queued jobs with ${images.length} image details`)

    return NextResponse.json({
      jobs: jobsWithImageInfo,
      queuedScans: queuedScansWithInfo,
      queueStats: queueStats
    })
    
  } catch (error) {
    logger.error('Error getting scan jobs:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}