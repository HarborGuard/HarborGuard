import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateXlsxReport } from '@/lib/reporting/xlsx-report'
import { apiError } from '@/lib/api/api-utils'
import { DashboardS3Client } from '@/lib/storage/s3'

async function loadScannerData(metadata: any, scanner: string): Promise<any> {
  if (metadata?.s3Prefix && DashboardS3Client.isConfigured()) {
    try {
      const s3 = DashboardS3Client.getInstance();
      const scanId = metadata.s3Prefix.replace('scans/', '').replace(/\/$/, '');
      const data = await s3.getRawResult(scanId, scanner);
      if (data) return data;
    } catch { /* fall through to JSONB */ }
  }
  return null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string; scanId: string }> }
) {
  try {
    const { name, scanId } = await params
    const decodedImageName = decodeURIComponent(name)

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

    if (scan.image.name !== decodedImageName) {
      return NextResponse.json({ error: 'Scan does not belong to this image' }, { status: 404 })
    }

    // Load scanner data with S3 fallback
    const scannerNames = ['trivy', 'grype', 'syft', 'dockle', 'osv'];
    const scannerEntries = await Promise.all(
      scannerNames.map(async (s) => [s, await loadScannerData(scan.metadata, s)] as const)
    );
    const scannerData = Object.fromEntries(scannerEntries.filter(([, v]) => v != null));

    const xlsxBuffer = generateXlsxReport(scan, decodedImageName, Object.keys(scannerData).length > 0 ? scannerData : undefined)

    const filename = `${decodedImageName.replace('/', '_')}_${scanId}_report.xlsx`
    const headers = new Headers()
    headers.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    headers.set('Content-Disposition', `attachment; filename="${filename}"`)

    return new NextResponse(xlsxBuffer as any, { headers })
  } catch (error) {
    return apiError(error, 'Failed to generate XLSX report');
  }
}
