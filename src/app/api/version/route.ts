/**
 * Version check API endpoint
 * Checks if a newer version is available from ghcr.io/harborguard/harborguard:latest
 */

import { NextRequest, NextResponse } from 'next/server';
import { versionDetector } from '@/lib/version-detector';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    logger.debug('Version check requested via API');
    
    const versionInfo = await versionDetector.checkForUpdates();
    
    return NextResponse.json({
      success: true,
      version: versionInfo
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Version check API failed:', errorMessage);
    
    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        version: {
          current: versionDetector.getCurrentVersion(),
          hasUpdate: false,
          lastChecked: new Date(),
          error: errorMessage
        }
      },
      { status: 500 }
    );
  }
}

// Also support HEAD requests for quick health checks
export async function HEAD(request: NextRequest) {
  try {
    const cachedInfo = versionDetector.getCachedVersionInfo();
    return new NextResponse(null, { 
      status: 200,
      headers: {
        'X-Current-Version': versionDetector.getCurrentVersion(),
        'X-Has-Update': cachedInfo?.hasUpdate ? 'true' : 'false',
        'X-Last-Checked': cachedInfo?.lastChecked?.toISOString() || 'never'
      }
    });
  } catch (error) {
    return new NextResponse(null, { status: 500 });
  }
}