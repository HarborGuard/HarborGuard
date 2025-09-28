import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateXlsxReport } from '@/lib/xlsx-report'

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

    const xlsxBuffer = generateXlsxReport(scan, decodedImageName)

    const filename = `${decodedImageName.replace('/', '_')}_${scanId}_report.xlsx`
    const headers = new Headers()
    headers.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    headers.set('Content-Disposition', `attachment; filename="${filename}"`)

    return new NextResponse(xlsxBuffer as any, { headers })
  } catch (error) {
    console.error('Error generating XLSX report:', error)
    return NextResponse.json({ error: 'Failed to generate XLSX report' }, { status: 500 })
  }
}