import { NextRequest, NextResponse } from 'next/server';
import { schedulerService } from '@/lib/scheduler/SchedulerService';
import { z } from 'zod';

const CreateScheduleSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  cronExpression: z.string().min(1, 'Cron expression is required'),
  scanRequest: z.union([
    // Regular scan request
    z.object({
      image: z.string().min(1),
      tag: z.string().min(1),
      registry: z.string().optional(),
      source: z.string().optional(),
      dockerImageId: z.string().optional(),
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
  ]),
  createdBy: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate request body
    const validatedData = CreateScheduleSchema.parse(body);
    
    const schedule = await schedulerService.createSchedule(validatedData as any);
    
    return NextResponse.json({
      success: true,
      data: schedule
    }, { status: 201 });
    
  } catch (error) {
    console.error('Failed to create schedule:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: 'Invalid request data',
        details: error.issues
      }, { status: 400 });
    }
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create schedule'
    }, { status: 500 });
  }
}

export async function GET() {
  try {
    const schedules = await schedulerService.getSchedules();
    
    return NextResponse.json({
      success: true,
      data: schedules
    });
    
  } catch (error) {
    console.error('Failed to get schedules:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get schedules'
    }, { status: 500 });
  }
}