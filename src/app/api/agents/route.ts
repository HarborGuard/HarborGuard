import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateApiKey } from '@/lib/agent/api-keys';

function isLocalRequest(request: NextRequest): boolean {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIP = request.headers.get('x-real-ip');
  const ip = forwarded?.split(',')[0] || realIP || 'localhost';
  const allowedIPs = ['127.0.0.1', '::1', 'localhost'];
  if (allowedIPs.some((a) => ip === a)) return true;
  if (ip.startsWith('10.')) return true;
  if (ip.startsWith('172.')) {
    const secondOctet = parseInt(ip.split('.')[1], 10);
    if (secondOctet >= 16 && secondOctet <= 31) return true;
  }
  return false;
}

export async function GET(request: NextRequest) {
  try {
    if (!isLocalRequest(request)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
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

    // Batch-mark stale agents as disconnected
    const staleThreshold = new Date(Date.now() - 2 * 60 * 1000);
    await prisma.agent.updateMany({
      where: { status: 'ACTIVE', lastSeenAt: { lt: staleThreshold } },
      data: { status: 'DISCONNECTED' },
    });

    // Reflect in response without re-querying
    for (const agent of agents) {
      if (agent.status === 'ACTIVE' && agent.lastSeenAt && agent.lastSeenAt < staleThreshold) {
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
    if (!isLocalRequest(request)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Agent name is required' }, { status: 400 });
    }

    const { key, hash } = generateApiKey();

    const agent = await prisma.agent.create({
      data: {
        name,
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
