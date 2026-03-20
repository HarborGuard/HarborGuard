import { NextResponse } from 'next/server';
import { KubeClient } from '@/lib/kubernetes';

export async function GET() {
  try {
    const client = new KubeClient();
    const available = await client.isAvailable();

    return NextResponse.json({
      available,
      clusterName: available ? client.getClusterName() : undefined,
      namespace: available ? client.getDefaultNamespace() : undefined,
    });
  } catch (error) {
    console.error('Failed to check Kubernetes status:', error);
    return NextResponse.json({
      available: false,
    });
  }
}
