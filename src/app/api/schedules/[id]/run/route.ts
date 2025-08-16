import { NextRequest, NextResponse } from 'next/server';
import { schedulerService } from '@/lib/scheduler/SchedulerService';
import { scannerService } from '@/lib/scanner';
import { prisma } from '@/lib/prisma';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    
    // Get the schedule
    const schedule = await schedulerService.getSchedule(id);
    
    if (!schedule) {
      return NextResponse.json({
        success: false,
        error: 'Schedule not found'
      }, { status: 404 });
    }

    // Execute the scan immediately
    let scanId: string | undefined;
    const scanRequest = schedule.scanRequest as any;

    if ('type' in scanRequest && scanRequest.type === 'bulk') {
      // Handle bulk scan request
      const { BulkScanService } = await import('@/lib/bulk/BulkScanService');
      const bulkService = new BulkScanService();
      const result = await bulkService.executeBulkScan(scanRequest);
      scanId = result.batchId; // Use batch ID as scan reference
    } else {
      // Handle regular scan request
      const result = await scannerService.startScan(scanRequest);
      scanId = result.scanId;
    }

    // Log the manual execution
    await prisma.scheduledScanExecution.create({
      data: {
        scheduleId: id,
        scanId,
        status: 'SUCCESS'
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        scanId,
        message: 'Schedule executed successfully'
      }
    });
    
  } catch (error) {
    console.error('Failed to run schedule:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to run schedule'
    }, { status: 500 });
  }
}