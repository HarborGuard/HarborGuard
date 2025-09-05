import { NextResponse } from 'next/server';

export async function GET() {
  // Check if raw output viewing is enabled via environment variable
  const enabled = process.env.ENABLE_RAW_OUTPUT === 'true';
  
  return NextResponse.json({
    enabled: enabled,
    message: enabled 
      ? 'Raw scanner output viewing is enabled' 
      : 'Raw scanner output viewing is disabled'
  });
}