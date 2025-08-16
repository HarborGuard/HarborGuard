import { NextRequest, NextResponse } from 'next/server';
import { schedulerService } from '@/lib/scheduler/SchedulerService';
import { z } from 'zod';

const UpdateScheduleSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  cronExpression: z.string().optional(),
  isActive: z.boolean().optional(),
  scanRequest: z.union([
    // Single scan request
    z.object({
      type: z.literal('single'),
      image: z.string(),
      tag: z.string().optional(),
      registry: z.string().optional(),
      scanTemplate: z.string().optional(),
    }),
    // Bulk scan request
    z.object({
      type: z.literal('bulk'),
      patterns: z.object({
        imagePattern: z.string().optional(),
        registryPattern: z.string().optional(),
        tagPattern: z.string().optional(),
      }),
      excludePatterns: z.array(z.string()).optional(),
      maxConcurrent: z.number().optional(),
      scanTemplate: z.string().optional(),
    })
  ]).optional(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const schedule = await schedulerService.getSchedule(id);
    
    if (!schedule) {
      return NextResponse.json({
        success: false,
        error: 'Schedule not found'
      }, { status: 404 });
    }
    
    return NextResponse.json({
      success: true,
      data: schedule
    });
    
  } catch (error) {
    console.error('Failed to get schedule:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get schedule'
    }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    
    // Validate request body
    const validatedData = UpdateScheduleSchema.parse(body);
    
    const schedule = await schedulerService.updateSchedule(id, validatedData as any);
    
    return NextResponse.json({
      success: true,
      data: schedule
    });
    
  } catch (error) {
    console.error('Failed to update schedule:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: 'Invalid request data',
        details: error.issues
      }, { status: 400 });
    }
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update schedule'
    }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    await schedulerService.deleteSchedule(id);
    
    return NextResponse.json({
      success: true,
      message: 'Schedule deleted successfully'
    });
    
  } catch (error) {
    console.error('Failed to delete schedule:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete schedule'
    }, { status: 500 });
  }
}