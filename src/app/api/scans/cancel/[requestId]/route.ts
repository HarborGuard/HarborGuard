import { NextRequest, NextResponse } from 'next/server'
import { scannerService } from '@/lib/scanner'
import { apiError } from '@/lib/api/api-utils'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const { requestId } = await params
    
    const cancelled = await scannerService.cancelScan(requestId)
    
    if (!cancelled) {
      return NextResponse.json(
        { error: 'Scan not found or cannot be cancelled' },
        { status: 404 }
      )
    }
    
    return NextResponse.json({
      success: true,
      message: 'Scan cancelled successfully'
    })
    
  } catch (error) {
    return apiError(error, 'Error cancelling scan');
  }
}