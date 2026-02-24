import { NextResponse } from 'next/server';
import { getSwarmInfo, listSwarmServices } from '@/lib/docker';
import { apiError } from '@/lib/api-utils';

export async function GET() {
  try {
    const swarmInfo = await getSwarmInfo();

    if (!swarmInfo.active) {
      return NextResponse.json({
        data: {
          swarmMode: false,
          message: 'Docker is not running in Swarm mode',
          services: [],
        },
      });
    }

    if (!swarmInfo.isManager) {
      return NextResponse.json({
        data: {
          swarmMode: true,
          isManager: false,
          message: 'This node is not a Swarm manager. Service listing requires manager access.',
          services: [],
        },
      });
    }

    const services = await listSwarmServices();

    return NextResponse.json({
      data: {
        swarmMode: true,
        isManager: true,
        swarmInfo: {
          ...swarmInfo,
          services: services.length,
        },
        services,
      },
    });
  } catch (error) {
    return apiError(error, 'Failed to get Swarm services');
  }
}
