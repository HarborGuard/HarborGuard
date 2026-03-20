import { NextResponse } from 'next/server';
import { listDockerImages } from '@/lib/docker';
import { apiError } from '@/lib/api/api-utils';

export async function GET() {
  try {
    const images = await listDockerImages();
    return NextResponse.json({ data: images });
  } catch (error) {
    return apiError(error, 'Failed to list Docker images');
  }
}