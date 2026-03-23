import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { apiError } from '@/lib/api/api-utils'
import { loadScannerDataFromS3, DashboardS3Client } from '@/lib/storage/s3'

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

    // If not in DB metadata, try S3 fallback via s3Prefix
    if (!reportData) {
      reportData = await loadScannerDataFromS3(metadata, reportType.toLowerCase())
    }

    // If still not found, try looking up via AgentJob (sensor uses job ID as S3 key)
    if (!reportData && DashboardS3Client.isConfigured()) {
      try {
        const agentJob = await prisma.agentJob.findFirst({
          where: { scanId },
          select: { id: true },
        })
        if (agentJob) {
          const s3 = DashboardS3Client.getInstance()
          reportData = await s3.getRawResult(agentJob.id, reportType.toLowerCase())
        }
      } catch { /* S3 not available */ }
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
    return apiError(error, 'Failed to download report');
  }
}