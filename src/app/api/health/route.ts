/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Health check endpoint
 *     description: Returns system health status and configuration details
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: System is healthy or degraded but operational
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [healthy, unhealthy, degraded]
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 version:
 *                   type: string
 *                 uptime:
 *                   type: number
 *                 checks:
 *                   type: object
 *       404:
 *         description: Health checks are disabled
 *       503:
 *         description: System is unhealthy
 *   head:
 *     summary: Lightweight health check
 *     description: Quick health check for load balancers
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: System is healthy
 *       404:
 *         description: Health checks are disabled
 *       503:
 *         description: System is unhealthy
 */

import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { databaseCleanup } from '@/lib/cleanup';

interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  version: string;
  uptime: number;
  checks: {
    database: {
      status: 'healthy' | 'unhealthy';
      responseTime?: number;
      error?: string;
    };
    scanners: {
      status: 'healthy' | 'degraded';
      enabled: string[];
      total: number;
    };
    configuration: {
      status: 'healthy';
      port: number;
      logLevel: string;
      maxConcurrentScans: number;
      scanTimeout: number;
      cleanupDays: number;
      notifications: boolean;
      versionCheckEnabled: boolean;
    };
    cleanup?: {
      status: 'healthy' | 'degraded';
      oldScans?: number;
      totalScans?: number;
    };
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Check if health checks are enabled
  if (!config.healthCheckEnabled) {
    return NextResponse.json(
      { error: 'Health checks are disabled' },
      { status: 404 }
    );
  }

  logger.health('Health check requested');

  const startTime = Date.now();
  const healthStatus: HealthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.NEXT_PUBLIC_APP_VERSION || '0.1.0',
    uptime: process.uptime(),
    checks: {
      database: {
        status: 'healthy'
      },
      scanners: {
        status: 'healthy',
        enabled: config.enabledScanners,
        total: config.enabledScanners.length
      },
      configuration: {
        status: 'healthy',
        port: config.port,
        logLevel: config.logLevel,
        maxConcurrentScans: config.maxConcurrentScans,
        scanTimeout: config.scanTimeoutMinutes,
        cleanupDays: config.cleanupOldScansDays,
        notifications: !!(config.teamsWebhookUrl || config.slackWebhookUrl),
        versionCheckEnabled: config.versionCheckEnabled
      }
    }
  };

  try {
    // Test database connectivity
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const dbResponseTime = Date.now() - dbStart;
    
    healthStatus.checks.database = {
      status: 'healthy',
      responseTime: dbResponseTime
    };

    logger.health(`Database check passed in ${dbResponseTime}ms`);

    // Get cleanup statistics if available
    try {
      const cleanupStats = await databaseCleanup.getCleanupStats();
      healthStatus.checks.cleanup = {
        status: cleanupStats.oldScans > 1000 ? 'degraded' : 'healthy',
        oldScans: cleanupStats.oldScans,
        totalScans: cleanupStats.totalScans
      };
    } catch (error) {
      logger.warn('Failed to get cleanup stats for health check:', error);
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Database health check failed:', errorMessage);
    
    healthStatus.status = 'unhealthy';
    healthStatus.checks.database = {
      status: 'unhealthy',
      error: errorMessage
    };
  }

  // Check scanner configuration
  if (config.enabledScanners.length === 0) {
    healthStatus.status = 'degraded';
    healthStatus.checks.scanners.status = 'degraded';
  }

  // Determine overall status
  if (healthStatus.checks.database.status === 'unhealthy') {
    healthStatus.status = 'unhealthy';
  } else if (
    healthStatus.checks.scanners.status === 'degraded' ||
    healthStatus.checks.cleanup?.status === 'degraded'
  ) {
    healthStatus.status = 'degraded';
  }

  const totalTime = Date.now() - startTime;
  logger.health(`Health check completed in ${totalTime}ms with status: ${healthStatus.status}`);

  // Return appropriate HTTP status code
  const statusCode = healthStatus.status === 'healthy' ? 200 : 
                    healthStatus.status === 'degraded' ? 200 : 503;

  return NextResponse.json(healthStatus, { status: statusCode });
}

export async function HEAD(request: NextRequest): Promise<NextResponse> {
  // Lightweight health check for load balancers
  if (!config.healthCheckEnabled) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    // Quick database ping
    await prisma.$queryRaw`SELECT 1`;
    logger.health('HEAD health check passed');
    return new NextResponse(null, { status: 200 });
  } catch (error) {
    logger.health('HEAD health check failed:', error);
    return new NextResponse(null, { status: 503 });
  }
}