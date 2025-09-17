import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';
import { EventType, LogCategory, LogAction } from '@/generated/prisma';

export type AuditEventType = 
  | 'page_view'
  | 'scan_start' 
  | 'scan_complete'
  | 'scan_failed'
  | 'cve_classification'
  | 'image_delete'
  | 'image_rescan'
  | 'bulk_scan_start'
  | 'user_login'
  | 'user_logout'
  | 'system_error';

// Map our custom event types to Prisma EventType enum
function mapEventType(eventType: AuditEventType): EventType {
  switch (eventType) {
    case 'page_view': return EventType.SYSTEM_EVENT
    case 'scan_start': return EventType.SCAN_START
    case 'scan_complete': return EventType.SCAN_COMPLETE
    case 'scan_failed': return EventType.SCAN_FAILED
    case 'cve_classification': return EventType.SYSTEM_EVENT
    case 'image_delete': return EventType.IMAGE_REMOVED
    case 'image_rescan': return EventType.SYSTEM_EVENT
    case 'bulk_scan_start': return EventType.SCAN_START
    case 'user_login': return EventType.USER_LOGIN
    case 'user_logout': return EventType.SYSTEM_EVENT
    case 'system_error': return EventType.SYSTEM_EVENT
    default: return EventType.SYSTEM_EVENT
  }
}

// Map our custom category types to Prisma LogCategory enum
function mapLogCategory(category: AuditCategory): LogCategory {
  switch (category) {
    case 'informative': return LogCategory.INFORMATIVE
    case 'action': return LogCategory.OPERATIONAL
    case 'security': return LogCategory.SECURITY
    case 'error': return LogCategory.ERROR
    default: return LogCategory.INFORMATIVE
  }
}

// Map common action strings to Prisma LogAction enum
function mapLogAction(action: string): LogAction {
  const actionLower = action.toLowerCase()
  if (actionLower.includes('create')) return LogAction.CREATE
  if (actionLower.includes('update')) return LogAction.UPDATE
  if (actionLower.includes('delete')) return LogAction.DELETE
  if (actionLower.includes('view') || actionLower.includes('read')) return LogAction.VIEW
  if (actionLower.includes('scan')) return LogAction.SCAN
  if (actionLower.includes('upload')) return LogAction.UPLOAD
  if (actionLower.includes('download')) return LogAction.DOWNLOAD
  if (actionLower.includes('login')) return LogAction.LOGIN
  if (actionLower.includes('logout')) return LogAction.LOGOUT
  return LogAction.VIEW // Default fallback
}

export type AuditCategory = 'informative' | 'action' | 'security' | 'error';

export interface AuditLogData {
  eventType: AuditEventType;
  category: AuditCategory;
  userIp: string;
  userAgent?: string;
  userId?: string;
  resource?: string;
  action: string;
  details?: Record<string, any>;
  metadata?: Record<string, any>;
}

/**
 * Extract user IP from Next.js request
 */
export function getUserIpFromRequest(request: NextRequest): string {
  // Check if DEMO_MODE is enabled
  if (process.env.NEXT_PUBLIC_DEMO_MODE === 'true') {
    return 'DEMO_PROTECT';
  }

  // Check various headers for IP address
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const cfConnectingIp = request.headers.get('cf-connecting-ip');

  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  if (realIp) {
    return realIp;
  }

  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  // No IP address available
  return 'unknown';
}

/**
 * Extract request metadata for audit logging
 */
export function getRequestMetadata(request: NextRequest): Record<string, any> {
  return {
    method: request.method,
    url: request.url,
    userAgent: request.headers.get('user-agent'),
    referer: request.headers.get('referer'),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Log an audit event to the database
 */
export async function logAuditEvent(data: AuditLogData): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        eventType: mapEventType(data.eventType),
        category: mapLogCategory(data.category),
        userIp: data.userIp,
        userAgent: data.userAgent,
        userId: data.userId,
        resource: data.resource,
        action: data.action ? mapLogAction(data.action) : LogAction.VIEW,
        details: data.details,
        metadata: data.metadata,
      },
    });
  } catch (error) {
    console.error('Failed to log audit event:', error);
    // Don't throw error to avoid breaking the main application flow
  }
}

/**
 * Log audit event from Next.js request
 */
export async function logAuditEventFromRequest(
  request: NextRequest,
  eventType: AuditEventType,
  category: AuditCategory,
  action: string,
  options: {
    resource?: string;
    details?: Record<string, any>;
    userId?: string;
  } = {}
): Promise<void> {
  const userIp = getUserIpFromRequest(request);
  const userAgent = request.headers.get('user-agent') || undefined;
  const metadata = getRequestMetadata(request);

  await logAuditEvent({
    eventType,
    category,
    userIp,
    userAgent,
    userId: options.userId,
    resource: options.resource,
    action,
    details: options.details,
    metadata,
  });
}

/**
 * Convenience functions for common audit events
 */
export const auditLogger = {
  /**
   * Log page view
   */
  pageView: async (request: NextRequest, pagePath: string) => {
    await logAuditEventFromRequest(
      request,
      'page_view',
      'informative',
      `User loaded ${pagePath}`,
      { resource: pagePath }
    );
  },

  /**
   * Log scan start
   */
  scanStart: async (request: NextRequest, imageName: string, source: string) => {
    await logAuditEventFromRequest(
      request,
      'scan_start',
      'action',
      `Started ${source} scan for ${imageName}`,
      { 
        resource: imageName,
        details: { source, imageName }
      }
    );
  },

  /**
   * Log scan completion
   */
  scanComplete: async (userIp: string, imageName: string, scanId: string) => {
    // Protect IP in demo mode
    const protectedIp = process.env.NEXT_PUBLIC_DEMO_MODE === 'true' ? 'DEMO_PROTECT' : userIp;

    await logAuditEvent({
      eventType: 'scan_complete',
      category: 'informative',
      userIp: protectedIp,
      action: `Completed scan for ${imageName}`,
      resource: imageName,
      details: { scanId, imageName }
    });
  },

  /**
   * Log CVE classification
   */
  cveClassification: async (
    request: NextRequest, 
    cveId: string, 
    imageName: string, 
    isFalsePositive: boolean,
    comment?: string
  ) => {
    const action = isFalsePositive 
      ? `Marked ${cveId} as false positive for ${imageName}${comment ? ` with comment "${comment}"` : ''}`
      : `Updated classification for ${cveId} on ${imageName}`;
      
    await logAuditEventFromRequest(
      request,
      'cve_classification',
      'action',
      action,
      { 
        resource: `${imageName}:${cveId}`,
        details: { cveId, imageName, isFalsePositive, comment }
      }
    );
  },

  /**
   * Log image deletion
   */
  imageDelete: async (request: NextRequest, imageName: string) => {
    await logAuditEventFromRequest(
      request,
      'image_delete',
      'action',
      `Deleted image ${imageName}`,
      { 
        resource: imageName,
        details: { imageName }
      }
    );
  },

  /**
   * Log image rescan
   */
  imageRescan: async (request: NextRequest, imageName: string, source: string) => {
    await logAuditEventFromRequest(
      request,
      'image_rescan',
      'action',
      `Triggered ${source} rescan for ${imageName}`,
      { 
        resource: imageName,
        details: { source, imageName }
      }
    );
  },

  /**
   * Log bulk scan start
   */
  bulkScanStart: async (request: NextRequest, patterns: string[], totalImages: number) => {
    await logAuditEventFromRequest(
      request,
      'bulk_scan_start',
      'action',
      `Started bulk scan for ${totalImages} images`,
      { 
        resource: 'bulk_scan',
        details: { patterns, totalImages }
      }
    );
  },

  /**
   * Log system errors
   */
  systemError: async (userIp: string, error: string, context?: Record<string, any>) => {
    // Protect IP in demo mode
    const protectedIp = process.env.NEXT_PUBLIC_DEMO_MODE === 'true' ? 'DEMO_PROTECT' : userIp;

    await logAuditEvent({
      eventType: 'system_error',
      category: 'error',
      userIp: protectedIp,
      action: `System error: ${error}`,
      details: { error, context }
    });
  }
};