/**
 * Readiness probe endpoint for Harbor Guard
 * Checks if the application is ready to serve traffic
 */

import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Check if health checks are enabled
  if (!config.healthCheckEnabled) {
    return NextResponse.json(
      { error: 'Health checks are disabled' },
      { status: 404 }
    );
  }

  logger.health('Readiness check requested');

  try {
    // Test database connectivity and migrations
    await prisma.$queryRaw`SELECT 1`;
    
    // Verify at least one scanner is enabled
    if (config.enabledScanners.length === 0) {
      throw new Error('No scanners enabled');
    }

    logger.health('Readiness check passed');
    
    return NextResponse.json({
      status: 'ready',
      timestamp: new Date().toISOString(),
      enabledScanners: config.enabledScanners.length
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Readiness check failed:', errorMessage);
    
    return NextResponse.json(
      {
        status: 'not ready',
        timestamp: new Date().toISOString(),
        error: errorMessage
      },
      { status: 503 }
    );
  }
}

export async function HEAD(request: NextRequest): Promise<NextResponse> {
  // Lightweight readiness check for load balancers
  if (!config.healthCheckEnabled) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    
    if (config.enabledScanners.length === 0) {
      return new NextResponse(null, { status: 503 });
    }

    logger.health('HEAD readiness check passed');
    return new NextResponse(null, { status: 200 });
  } catch (error) {
    logger.health('HEAD readiness check failed:', error);
    return new NextResponse(null, { status: 503 });
  }
}