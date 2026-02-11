/**
 * Version check API endpoint
 * Checks if a newer version is available from ghcr.io/harborguard/harborguard:latest
 */

import { NextRequest, NextResponse } from 'next/server';
import { versionDetector } from '@/lib/version-detector';
import { logger } from '@/lib/logger';
import { apiError } from '@/lib/api-utils';

export async function GET(request: NextRequest) {
  try {
    logger.debug('Version check requested via API');
    
    const versionInfo = await versionDetector.checkForUpdates();
    
    return NextResponse.json({
      success: true,
      version: versionInfo
    });
  } catch (error) {
    return apiError(error, 'Version check failed');
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