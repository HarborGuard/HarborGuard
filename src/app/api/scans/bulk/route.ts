import { NextRequest, NextResponse } from 'next/server';
import { BulkScanService } from '@/lib/bulk/BulkScanService';
import { z } from 'zod';

const BulkScanRequestSchema = z.object({
  name: z.string().optional(),
  patterns: z.object({
    imagePattern: z.string().optional(),
    registryPattern: z.string().optional(),
    tagPattern: z.string().optional(),
    excludeTagPattern: z.string().optional(),
  }),
  options: z.object({
    maxImages: z.number().min(1).max(1000).optional(),
    scanners: z.object({
      trivy: z.boolean().optional(),
      grype: z.boolean().optional(),
      syft: z.boolean().optional(),
      dockle: z.boolean().optional(),
      osv: z.boolean().optional(),
      dive: z.boolean().optional(),
    }).optional(),
  }).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate request body
    const validatedData = BulkScanRequestSchema.parse(body);
    
    const bulkScanService = new BulkScanService();
    const result = await bulkScanService.executeBulkScan(validatedData);
    
    return NextResponse.json({
      success: true,
      data: result
    }, { status: 201 });
    
  } catch (error) {
    console.error('Failed to start bulk scan:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: 'Invalid request data',
        details: error.issues
      }, { status: 400 });
    }
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start bulk scan'
    }, { status: 500 });
  }
}

export async function GET() {
  try {
    const bulkScanService = new BulkScanService();
    const history = await bulkScanService.getBulkScanHistory();
    
    return NextResponse.json({
      success: true,
      data: history
    });
    
  } catch (error) {
    console.error('Failed to get bulk scan history:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get bulk scan history'
    }, { status: 500 });
  }
}