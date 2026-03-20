import { NextRequest, NextResponse } from 'next/server';
import { KubeClient } from '@/lib/kubernetes';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const namespace = searchParams.get('namespace') || undefined;

    const client = new KubeClient();
    const available = await client.isAvailable();

    if (!available) {
      return NextResponse.json(
        { error: 'Kubernetes cluster is not available' },
        { status: 503 }
      );
    }

    const images = await client.listImages(namespace);

    return NextResponse.json({
      data: images,
      total: images.length,
    });
  } catch (error) {
    console.error('Failed to list Kubernetes images:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list Kubernetes images' },
      { status: 500 }
    );
  }
}
