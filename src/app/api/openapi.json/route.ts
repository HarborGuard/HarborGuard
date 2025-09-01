import { NextResponse } from 'next/server';
import { getOpenApiSpec } from '@/lib/openapi-dynamic';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    // In production with standalone build, use pre-generated spec
    if (process.env.NODE_ENV === 'production') {
      // First, try to load the pre-generated spec
      const generatedSpecPath = path.join(process.cwd(), 'src', 'generated', 'openapi.json');
      
      if (fs.existsSync(generatedSpecPath)) {
        console.log('[OpenAPI] Loading pre-generated spec from:', generatedSpecPath);
        const spec = JSON.parse(fs.readFileSync(generatedSpecPath, 'utf-8'));
        return NextResponse.json(spec);
      }
      
      console.log('[OpenAPI] Pre-generated spec not found, attempting dynamic generation');
    }
    
    // In development or if no pre-generated spec, use dynamic generation
    const spec = getOpenApiSpec();
    return NextResponse.json(spec);
  } catch (error) {
    console.error('Failed to generate OpenAPI spec:', error);
    // Fallback to static spec if everything fails
    const { openApiSpec } = await import('@/lib/openapi-spec');
    return NextResponse.json(openApiSpec);
  }
}