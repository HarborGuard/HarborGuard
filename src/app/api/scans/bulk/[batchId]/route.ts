import { NextRequest, NextResponse } from 'next/server';
import { BulkScanService } from '@/lib/bulk/BulkScanService';

interface RouteParams {
  params: Promise<{ batchId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { batchId } = await params;
    const bulkScanService = new BulkScanService();
    const status = await bulkScanService.getBulkScanStatus(batchId);
    
    return NextResponse.json({
      success: true,
      data: status
    });
    
  } catch (error) {
    console.error('Failed to get bulk scan status:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get bulk scan status'
    }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
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