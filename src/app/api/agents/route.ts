import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateApiKey } from '@/lib/agent/api-keys';

export async function GET() {
  try {
    const agents = await prisma.agent.findMany({
      select: {
        id: true,
        name: true,
        status: true,
        lastSeenAt: true,
        registeredAt: true,
        hostname: true,
        os: true,
        arch: true,
        sensorVersion: true,
        scannerVersions: true,
        capabilities: true,
        s3Configured: true,
        _count: { select: { scanJobs: true } },
      },
      orderBy: { registeredAt: 'desc' },
    });

    // Mark agents with no heartbeat in 2 minutes as disconnected
    const staleThreshold = new Date(Date.now() - 2 * 60 * 1000);
    for (const agent of agents) {
      if (agent.status === 'ACTIVE' && agent.lastSeenAt && agent.lastSeenAt < staleThreshold) {
        await prisma.agent.update({
          where: { id: agent.id },
          data: { status: 'DISCONNECTED' },
        });
        agent.status = 'DISCONNECTED';
      }
    }

    return NextResponse.json(agents);
  } catch (error) {
    console.error('Agent list error:', error);
    return NextResponse.json({ error: 'Failed to list agents' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Agent name is required' }, { status: 400 });
    }

    const { key, hash } = generateApiKey();

    const agent = await prisma.agent.create({
      data: {
        name,
        apiKey: key,
        apiKeyHash: hash,
      },
    });

    return NextResponse.json(
      {
        id: agent.id,
        name: agent.name,
        apiKey: key, // Only returned once at creation time
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('Agent creation error:', error);
    return NextResponse.json({ error: 'Failed to create agent' }, { status: 500 });
  }
}
