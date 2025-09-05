import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { prismaToScanWithImage, serializeScan } from '@/lib/type-utils'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    
    // Try to find by ID first, then by requestId
    let scan = await prisma.scan.findUnique({
      where: { id },
      include: {
        image: true,
        scanMetadata: true
      }
    })
    
    if (!scan) {
      scan = await prisma.scan.findUnique({
        where: { requestId: id },
        include: {
          image: true,
          scanMetadata: true
        }
      })
    }
    
    if (!scan) {
      return NextResponse.json(
        { error: 'Scan not found' },
        { status: 404 }
      )
    }
    
    // Convert Prisma data to properly typed scan
    const scanData = prismaToScanWithImage(scan);
    
    return NextResponse.json(serializeScan(scanData))
  } catch (error) {
    console.error('Error retrieving scan:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const updates = await request.json()
    
    // Find scan by ID or requestId
    let scan = await prisma.scan.findUnique({ where: { id } })
    if (!scan) {
      scan = await prisma.scan.findUnique({ where: { requestId: id } })
    }
    
    if (!scan) {
      return NextResponse.json(
        { error: 'Scan not found' },
        { status: 404 }
      )
    }
    
    // Update scan
    const updatedScan = await prisma.scan.update({
      where: { id: scan.id },
      data: {
        ...updates,
        updatedAt: new Date()
      },
      include: {
        image: true,
        scanMetadata: true
      }
    })
    
    // Convert Prisma data to properly typed scan
    const scanData = prismaToScanWithImage(updatedScan);
    
    return NextResponse.json(serializeScan(scanData))
  } catch (error) {
    console.error('Error updating scan:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    
    // Find scan by ID or requestId
    let scan = await prisma.scan.findUnique({ where: { id } })
    if (!scan) {
      scan = await prisma.scan.findUnique({ where: { requestId: id } })
    }
    
    if (!scan) {
      return NextResponse.json(
        { error: 'Scan not found' },
        { status: 404 }
      )
    }
    
    // Delete the scan and all related data (Prisma will handle cascading)
    await prisma.scan.delete({
      where: { id: scan.id }
    })
    
    return NextResponse.json(
      { success: true, message: 'Scan deleted successfully' },
      { status: 200 }
    )
  } catch (error) {
    console.error('Error deleting scan:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}