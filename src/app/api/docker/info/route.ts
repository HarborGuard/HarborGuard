import { NextResponse } from 'next/server';
import { checkDockerAccess, getSwarmInfo } from '@/lib/docker';
import { apiError } from '@/lib/api-utils';

export async function GET() {
  try {
    const dockerInfo = await checkDockerAccess();
    const swarmInfo = await getSwarmInfo();

    return NextResponse.json({
      ...dockerInfo,
      swarm: swarmInfo,
    });
  } catch (error) {
    return apiError(error, 'Failed to check Docker access');
  }
}