import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { EventType, LogCategory, LogAction } from '@/generated/prisma';

const auditLogQuerySchema = z.object({
  page: z.string().optional().default('1'),
  limit: z.string().optional().default('50'),
  eventType: z.string().optional(),
  category: z.string().optional(),
  userIp: z.string().optional(),
  resource: z.string().optional(),
  search: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

const createAuditLogSchema = z.object({
  eventType: z.string(),
  category: z.enum(['informative', 'action', 'security', 'error', 'INFORMATIVE', 'OPERATIONAL', 'SECURITY', 'ERROR']),
  userIp: z.string(),
  userAgent: z.string().optional(),
  userId: z.string().optional(),
  resource: z.string().optional(),
  action: z.string(),
  details: z.any().optional(),
  metadata: z.any().optional(),
});

// Map string event types to Prisma EventType enum
function mapEventType(eventType: string): EventType {
  switch (eventType.toLowerCase()) {
    case 'page_view': return EventType.SYSTEM_EVENT;
    case 'scan_start': return EventType.SCAN_START;
    case 'scan_complete': return EventType.SCAN_COMPLETE;
    case 'scan_failed': return EventType.SCAN_FAILED;
    case 'cve_classification': return EventType.SYSTEM_EVENT;
    case 'image_delete': return EventType.IMAGE_REMOVED;
    case 'image_rescan': return EventType.SYSTEM_EVENT;
    case 'bulk_scan_start': return EventType.SCAN_START;
    case 'user_login': return EventType.USER_LOGIN;
    case 'user_logout': return EventType.SYSTEM_EVENT;
    case 'system_error': return EventType.SYSTEM_EVENT;
    // Handle direct enum values
    case 'system_event': return EventType.SYSTEM_EVENT;
    case 'scan_start': return EventType.SCAN_START;
    case 'scan_complete': return EventType.SCAN_COMPLETE;
    case 'scan_failed': return EventType.SCAN_FAILED;
    case 'image_removed': return EventType.IMAGE_REMOVED;
    case 'user_login': return EventType.USER_LOGIN;
    default: return EventType.SYSTEM_EVENT;
  }
}

// Map string categories to Prisma LogCategory enum
function mapLogCategory(category: string): LogCategory {
  switch (category.toLowerCase()) {
    case 'informative': return LogCategory.INFORMATIVE;
    case 'action': 
    case 'operational': return LogCategory.OPERATIONAL;
    case 'security': return LogCategory.SECURITY;
    case 'error': return LogCategory.ERROR;
    default: return LogCategory.INFORMATIVE;
  }
}

// Map action strings to Prisma LogAction enum
function mapLogAction(action: string): LogAction {
  const actionLower = action.toLowerCase();
  if (actionLower.includes('create')) return LogAction.CREATE;
  if (actionLower.includes('update')) return LogAction.UPDATE;
  if (actionLower.includes('delete')) return LogAction.DELETE;
  if (actionLower.includes('view') || actionLower.includes('read')) return LogAction.VIEW;
  if (actionLower.includes('scan')) return LogAction.SCAN;
  if (actionLower.includes('upload')) return LogAction.UPLOAD;
  if (actionLower.includes('download')) return LogAction.DOWNLOAD;
  if (actionLower.includes('login')) return LogAction.LOGIN;
  if (actionLower.includes('logout')) return LogAction.LOGOUT;
  return LogAction.VIEW; // Default fallback
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = auditLogQuerySchema.parse(Object.fromEntries(searchParams));
    
    const page = parseInt(query.page);
    const limit = parseInt(query.limit);
    const offset = (page - 1) * limit;

    // Build where clause for filtering
    const where: any = {};
    
    if (query.eventType) {
      where.eventType = query.eventType;
    }
    
    if (query.category) {
      where.category = query.category;
    }
    
    if (query.userIp) {
      where.userIp = { contains: query.userIp };
    }
    
    if (query.resource) {
      where.resource = { contains: query.resource };
    }
    
    if (query.search) {
      where.OR = [
        { action: { contains: query.search } },
        { resource: { contains: query.search } },
        { userIp: { contains: query.search } },
        { eventType: { contains: query.search } },
      ];
    }
    
    if (query.startDate || query.endDate) {
      where.timestamp = {};
      if (query.startDate) {
        where.timestamp.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        where.timestamp.lte = new Date(query.endDate);
      }
    }

    // Get total count for pagination
    const total = await prisma.auditLog.count({ where });

    // Get audit logs
    const auditLogs = await prisma.auditLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      skip: offset,
      take: limit,
    });

    return NextResponse.json({
      auditLogs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch audit logs' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Manual validation instead of Zod for now
    if (!body.eventType || !body.category || !body.userIp || !body.action) {
      return NextResponse.json(
        { error: 'Missing required fields: eventType, category, userIp, action' },
        { status: 400 }
      );
    }

    // Protect IP in demo mode
    const protectedIp = process.env.NEXT_PUBLIC_DEMO_MODE === 'true' ? 'DEMO_PROTECT' : body.userIp;

    const auditLogData = {
      eventType: mapEventType(body.eventType),
      category: mapLogCategory(body.category),
      userIp: protectedIp,
      userAgent: body.userAgent || null,
      userId: body.userId || null,
      resource: body.resource || null,
      action: mapLogAction(body.action),
      details: body.details || null,
      metadata: body.metadata || null,
    };

    const auditLog = await prisma.auditLog.create({
      data: auditLogData,
    });

    return NextResponse.json(auditLog, { status: 201 });
  } catch (error) {
    console.error('Error creating audit log:', error);

    return NextResponse.json(
      { error: 'Failed to create audit log' },
      { status: 500 }
    );
  }
}