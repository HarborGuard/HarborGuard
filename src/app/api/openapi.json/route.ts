import { NextResponse } from 'next/server';
import { getOpenApiSpec } from '@/lib/openapi-dynamic';

export async function GET() {
  try {
    const spec = getOpenApiSpec();
    return NextResponse.json(spec);
  } catch (error) {
    console.error('Failed to generate OpenAPI spec:', error);
    // Fallback to static spec if dynamic generation fails
    const { openApiSpec } = await import('@/lib/openapi-spec');
    return NextResponse.json(openApiSpec);
  }
}