import { NextResponse } from 'next/server';
import { getSwarmInfo, listSwarmServices } from '@/lib/docker';

export async function GET() {
  try {
    const swarmInfo = await getSwarmInfo();

    if (!swarmInfo.active) {
      return NextResponse.json({
        swarmMode: false,
        message: 'Docker is not running in Swarm mode',
        services: [],
      });
    }

    if (!swarmInfo.isManager) {
      return NextResponse.json({
        swarmMode: true,
        isManager: false,
        message: 'This node is not a Swarm manager. Service listing requires manager access.',
        services: [],
      });
    }

    const services = await listSwarmServices();

    return NextResponse.json({
      swarmMode: true,
      isManager: true,
      swarmInfo: {
        ...swarmInfo,
        services: services.length,
      },
      services,
    });
  } catch (error) {
    console.error('Failed to get Swarm services:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to get Swarm services',
        swarmMode: false,
        services: [],
      },
      { status: 500 }
    );
  }
}
