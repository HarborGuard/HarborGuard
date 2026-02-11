import { NextRequest, NextResponse } from 'next/server';
import { BulkScanService } from '@/lib/bulk/BulkScanService';
import { apiError } from '@/lib/api-utils';

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
    return apiError(error, 'Failed to get bulk scan status');
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
    return apiError(error, 'Failed to cancel bulk scan');
  }
}