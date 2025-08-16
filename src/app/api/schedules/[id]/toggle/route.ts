import { NextRequest, NextResponse } from 'next/server';
import { schedulerService } from '@/lib/scheduler/SchedulerService';
import { z } from 'zod';

const ToggleScheduleSchema = z.object({
  isActive: z.boolean()
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    
    const validatedData = ToggleScheduleSchema.parse(body);
    
    const schedule = await schedulerService.toggleSchedule(id, validatedData.isActive);
    
    return NextResponse.json({
      success: true,
      data: schedule,
      message: `Schedule ${validatedData.isActive ? 'activated' : 'deactivated'} successfully`
    });
    
  } catch (error) {
    console.error('Failed to toggle schedule:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: 'Invalid request data',
        details: error.issues
      }, { status: 400 });
    }
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to toggle schedule'
    }, { status: 500 });
  }
}