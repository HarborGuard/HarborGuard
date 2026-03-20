import { NextResponse } from 'next/server';
import { KubeClient } from '@/lib/kubernetes';

export async function GET() {
  try {
    const client = new KubeClient();
    const available = await client.isAvailable();

    if (!available) {
      return NextResponse.json(
        { error: 'Kubernetes cluster is not available' },
        { status: 503 }
      );
    }

    const namespaces = await client.listNamespaces();

    return NextResponse.json({
      data: namespaces,
    });
  } catch (error) {
    console.error('Failed to list Kubernetes namespaces:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list Kubernetes namespaces' },
      { status: 500 }
    );
  }
}
