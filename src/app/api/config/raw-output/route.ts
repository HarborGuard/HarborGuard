import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api/api-utils';

export async function GET() {
  try {
    // Check if raw output viewing is enabled via environment variable
    const enabled = process.env.ENABLE_RAW_OUTPUT === 'true';

    return NextResponse.json({
      enabled: enabled,
      message: enabled
        ? 'Raw scanner output viewing is enabled'
        : 'Raw scanner output viewing is disabled'
    });
  } catch (error) {
    return apiError(error, 'Failed to get raw output configuration');
  }
}