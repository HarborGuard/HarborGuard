import { NextRequest, NextResponse } from 'next/server';
import { BulkScanService } from '@/lib/bulk/BulkScanService';

interface RouteParams {
  params: Promise<{ batchId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { batchId } = await params;
    
    const bulkScanService = new BulkScanService();
    await bulkScanService.cancelBulkScan(batchId);
    
    return NextResponse.json({
      success: true,
      message: 'Bulk scan cancelled successfully'
    });
    
  } catch (error) {
    console.error('Failed to cancel bulk scan:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to cancel bulk scan'
    }, { status: 500 });
  }
}