import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import JSZip from 'jszip'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string; scanId: string }> }
) {
  try {
    const { name, scanId } = await params
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

    // Create a new ZIP file
    const zip = new JSZip()
    const reportsFolder = zip.folder('reports')

    // Add available reports to the ZIP - check both new and old schema locations
    const scanResults = (scan as any).metadata?.scanResults || {};
    const scannerReports = (scan as any).scannerReports || {};
    const reports = [
      { name: 'trivy', data: scanResults.trivy || scannerReports.trivy || (scan as any).trivy },
      { name: 'grype', data: scanResults.grype || scannerReports.grype || (scan as any).grype },
      { name: 'syft', data: scanResults.syft || scannerReports.syft || (scan as any).syft },
      { name: 'dockle', data: scanResults.dockle || scannerReports.dockle || (scan as any).dockle },
      { name: 'osv', data: scanResults.osv || scannerReports.osv || (scan as any).osv },
      { name: 'dive', data: scanResults.dive || scannerReports.dive || (scan as any).dive }
    ]

    let hasReports = false
    for (const report of reports) {
      if (report.data) {
        reportsFolder?.file(`${report.name}.json`, JSON.stringify(report.data, null, 2))
        hasReports = true
      }
    }

    if (!hasReports) {
      return NextResponse.json({ error: 'No reports found for this scan' }, { status: 404 })
    }

    // Add scan metadata
    const metadata = {
      scanId: scan.id,
      imageName: scan.image.name,
      imageTag: scan.image.tag,
      startedAt: scan.startedAt,
      finishedAt: scan.finishedAt,
      status: scan.status,
      requestId: (scan as any).requestId,
      vulnerabilityCount: (scan as any).vulnerabilityCount,
      riskScore: (scan as any).riskScore,
      complianceScore: (scan as any).complianceScore,
      scannerVersions: (scan as any).scannerVersions,
      exportedAt: new Date().toISOString()
    }
    
    zip.file('scan-metadata.json', JSON.stringify(metadata, null, 2))

    // Generate the ZIP file
    const zipBuffer = await zip.generateAsync({ type: 'arraybuffer' })
    
    // Set headers for file download
    const filename = `${decodedImageName.replace('/', '_')}_${scanId}_reports.zip`
    const headers = new Headers()
    headers.set('Content-Type', 'application/zip')
    headers.set('Content-Disposition', `attachment; filename="${filename}"`)
    
    return new NextResponse(zipBuffer, { headers })
  } catch (error) {
    console.error('Error creating report ZIP:', error)
    return NextResponse.json({ error: 'Failed to create report ZIP' }, { status: 500 })
  }
}