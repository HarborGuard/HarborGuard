import { NextRequest, NextResponse } from 'next/server'
import { scannerService } from '@/lib/scanner'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

export async function GET(request: NextRequest) {
  try {
    const jobs = scannerService.getAllJobs()
    
    // If no jobs, return early to avoid unnecessary database queries
    if (jobs.length === 0) {
      return NextResponse.json({ jobs: [] })
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
    
    logger.debug(`Retrieved ${jobs.length} scan jobs with ${images.length} image details`)
    
    return NextResponse.json({
      jobs: jobsWithImageInfo
    })
    
  } catch (error) {
    logger.error('Error getting scan jobs:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}