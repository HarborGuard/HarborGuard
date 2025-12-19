import { NextResponse } from 'next/server';
import { checkDockerAccess, getSwarmInfo } from '@/lib/docker';

export async function GET() {
  try {
    const dockerInfo = await checkDockerAccess();
    const swarmInfo = await getSwarmInfo();

    return NextResponse.json({
      ...dockerInfo,
      swarm: swarmInfo,
    });
  } catch (error) {
    console.error('Failed to check Docker access:', error);
    return NextResponse.json(
      {
        hasAccess: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}