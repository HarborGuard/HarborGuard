import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string; scanId: string; reportType: string }> }
) {
  try {
    const { name, scanId, reportType } = await params
    const decodedImageName = decodeURIComponent(name)
    
    // Find the scan
    const scan = await prisma.scan.findUnique({
      where: { id: scanId },
      include: {
        image: true,
        metadata: true
      }
    })

    if (!scan) {
      return NextResponse.json({ error: 'Scan not found' }, { status: 404 })
    }

    // Verify the scan belongs to the correct image
    if (scan.image.name !== decodedImageName) {
      return NextResponse.json({ error: 'Scan does not belong to this image' }, { status: 404 })
    }

    // Get the appropriate report data based on reportType
    let reportData: any = null
    let filename: string = ''

    // Get scan results from the metadata
    const metadata = scan.metadata;
    
    switch (reportType.toLowerCase()) {
      case 'trivy':
        reportData = metadata?.trivyResults
        filename = `${decodedImageName.replace('/', '_')}_${scanId}_trivy.json`
        break
      case 'grype':
        reportData = metadata?.grypeResults
        filename = `${decodedImageName.replace('/', '_')}_${scanId}_grype.json`
        break
      case 'syft':
        reportData = metadata?.syftResults
        filename = `${decodedImageName.replace('/', '_')}_${scanId}_syft.json`
        break
      case 'dockle':
        reportData = metadata?.dockleResults
        filename = `${decodedImageName.replace('/', '_')}_${scanId}_dockle.json`
        break
      case 'osv':
        reportData = metadata?.osvResults
        filename = `${decodedImageName.replace('/', '_')}_${scanId}_osv.json`
        break
      case 'dive':
        reportData = metadata?.diveResults
        filename = `${decodedImageName.replace('/', '_')}_${scanId}_dive.json`
        break
      default:
        return NextResponse.json({ error: 'Invalid report type' }, { status: 400 })
    }

    if (!reportData) {
      return NextResponse.json({ error: `${reportType} report not found` }, { status: 404 })
    }

    // Set headers for file download
    const headers = new Headers()
    headers.set('Content-Type', 'application/json')
    headers.set('Content-Disposition', `attachment; filename="${filename}"`)
    
    return new NextResponse(JSON.stringify(reportData, null, 2), { headers })
  } catch (error) {
    console.error('Error downloading report:', error)
    return NextResponse.json({ error: 'Failed to download report' }, { status: 500 })
  }
}