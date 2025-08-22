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
        image: true
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

    // Get scan results from the new schema structure
    const scanResults = (scan as any).metadata?.scanResults;
    
    switch (reportType.toLowerCase()) {
      case 'trivy':
        reportData = scanResults?.trivy || (scan as any).scannerReports?.trivy || (scan as any).trivy
        filename = `${decodedImageName.replace('/', '_')}_${scanId}_trivy.json`
        break
      case 'grype':
        reportData = scanResults?.grype || (scan as any).scannerReports?.grype || (scan as any).grype
        filename = `${decodedImageName.replace('/', '_')}_${scanId}_grype.json`
        break
      case 'syft':
        reportData = scanResults?.syft || (scan as any).scannerReports?.syft || (scan as any).syft
        filename = `${decodedImageName.replace('/', '_')}_${scanId}_syft.json`
        break
      case 'dockle':
        reportData = scanResults?.dockle || (scan as any).scannerReports?.dockle || (scan as any).dockle
        filename = `${decodedImageName.replace('/', '_')}_${scanId}_dockle.json`
        break
      case 'osv':
        reportData = scanResults?.osv || (scan as any).scannerReports?.osv || (scan as any).osv
        filename = `${decodedImageName.replace('/', '_')}_${scanId}_osv.json`
        break
      case 'dive':
        reportData = scanResults?.dive || (scan as any).scannerReports?.dive || (scan as any).dive
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