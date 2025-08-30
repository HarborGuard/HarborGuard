import { NextRequest, NextResponse } from 'next/server';
import { scannerService } from '@/lib/scanner';

/**
 * GET /api/scans/queue
 * Returns the current queue status and statistics
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const requestId = searchParams.get('requestId');
    
    if (requestId) {
      // Get specific scan queue information
      const position = scannerService.getQueuePosition(requestId);
      const estimatedWaitTime = scannerService.getEstimatedWaitTime(requestId);
      
      if (position === -1) {
        return NextResponse.json({
          requestId,
          queued: false,
          message: 'Scan not found in queue'
        });
      }
      
      return NextResponse.json({
        requestId,
        queued: true,
        queuePosition: position,
        estimatedWaitTime
      });
    }
    
    // Get overall queue statistics
    const stats = scannerService.getQueueStats();
    const queuedScans = scannerService.getQueuedScans();
    const runningScans = scannerService.getRunningScans();
    
    return NextResponse.json({
      stats,
      queued: queuedScans.map(scan => ({
        requestId: scan.requestId,
        scanId: scan.scanId,
        image: `${scan.request.image}:${scan.request.tag}`,
        queuedAt: scan.queuedAt,
        priority: scan.priority,
        position: scannerService.getQueuePosition(scan.requestId)
      })),
      running: runningScans.map(scan => ({
        requestId: scan.requestId,
        scanId: scan.scanId,
        image: `${scan.request.image}:${scan.request.tag}`,
        startedAt: scan.startedAt
      }))
    });
    
  } catch (error) {
    console.error('Error fetching queue status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch queue status' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/scans/queue
 * Clear the queue (emergency stop)
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const requestId = searchParams.get('requestId');
    
    if (requestId) {
      // Cancel specific scan from queue
      const cancelled = await scannerService.cancelScan(requestId);
      
      if (cancelled) {
        return NextResponse.json({
          success: true,
          message: `Scan ${requestId} cancelled`
        });
      } else {
        return NextResponse.json(
          { error: 'Scan not found or already completed' },
          { status: 404 }
        );
      }
    }
    
    // Clear entire queue (requires confirmation)
    const confirmHeader = request.headers.get('x-confirm-clear');
    if (confirmHeader !== 'true') {
      return NextResponse.json(
        { error: 'Queue clear requires confirmation header: x-confirm-clear=true' },
        { status: 400 }
      );
    }
    
    const clearedCount = scannerService.getQueuedScans().length;
    scannerService.getQueuedScans().forEach(scan => {
      scannerService.cancelScan(scan.requestId);
    });
    
    return NextResponse.json({
      success: true,
      message: `Cleared ${clearedCount} scans from queue`
    });
    
  } catch (error) {
    console.error('Error managing queue:', error);
    return NextResponse.json(
      { error: 'Failed to manage queue' },
      { status: 500 }
    );
  }
}