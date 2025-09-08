import { NextRequest, NextResponse } from 'next/server';
import { VulnerabilityAnalyzer } from '@/lib/patcher/VulnerabilityAnalyzer';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const scanId = searchParams.get('scanId');
    
    if (!scanId) {
      return NextResponse.json(
        { error: 'Scan ID is required' },
        { status: 400 }
      );
    }

    logger.info(`Fetching patchable vulnerabilities for scan ${scanId}`);
    
    const analyzer = new VulnerabilityAnalyzer();
    const analysis = await analyzer.analyzeScanForPatching(scanId, true); // true to include detailed vulnerability list
    
    return NextResponse.json({
      success: true,
      analysis
    });

  } catch (error) {
    logger.error('Failed to fetch patchable vulnerabilities:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch patchable vulnerabilities',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

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