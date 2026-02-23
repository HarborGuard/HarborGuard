import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { VulnerabilityAnalyzer } from '@/lib/patcher/VulnerabilityAnalyzer';
import { logger } from '@/lib/logger';
import { apiError } from '@/lib/api-utils';

const AnalyzePatchSchema = z.object({
  scanId: z.string().min(1),
});

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
    return apiError(error, 'Failed to fetch patchable vulnerabilities');
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = AnalyzePatchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues },
        { status: 400 }
      );
    }

    const { scanId } = parsed.data;

    logger.info(`Analyzing scan ${scanId} for patching`);

    const analyzer = new VulnerabilityAnalyzer();
    const analysis = await analyzer.analyzeScanForPatching(scanId);
    
    return NextResponse.json({
      success: true,
      analysis
    });

  } catch (error) {
    return apiError(error, 'Failed to analyze scan for patching');
  }
}