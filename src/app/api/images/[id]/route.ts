import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    
    // Fetch image with its scans
    const image = await prisma.image.findUnique({
      where: { id },
      include: {
        scans: {
          orderBy: { startedAt: 'desc' },
          include: {
            image: true
          }
        }
      }
    })
    
    if (!image) {
      return NextResponse.json(
        { error: 'Image not found' },
        { status: 404 }
      )
    }
    
    // Convert BigInt to string for JSON serialization (if needed)
    const serializedImage = {
      ...image,
      sizeBytes: image.sizeBytes ? image.sizeBytes.toString() : null,
      scans: image.scans.map(scan => ({
        ...scan,
        image: {
          ...scan.image,
          sizeBytes: scan.image.sizeBytes ? scan.image.sizeBytes.toString() : null
        }
      }))
    }
    
    return NextResponse.json(serializedImage)
    
  } catch (error) {
    console.error('Error fetching image:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}