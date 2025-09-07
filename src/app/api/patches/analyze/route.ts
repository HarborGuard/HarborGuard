import { NextRequest, NextResponse } from 'next/server';
import { VulnerabilityAnalyzer } from '@/lib/patcher/VulnerabilityAnalyzer';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const { scanId } = await request.json();
    
    if (!scanId) {
      return NextResponse.json(
        { error: 'Scan ID is required' },
        { status: 400 }
      );
    }

    logger.info(`Analyzing scan ${scanId} for patching`);
    
    const analyzer = new VulnerabilityAnalyzer();
    const analysis = await analyzer.analyzeScanForPatching(scanId);
    
    return NextResponse.json({
      success: true,
      analysis
    });

  } catch (error) {
    logger.error('Failed to analyze scan for patching:', error);
    return NextResponse.json(
      { 
        error: 'Failed to analyze scan for patching',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}