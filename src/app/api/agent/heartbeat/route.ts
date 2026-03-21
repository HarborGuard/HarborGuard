import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { extractBearerToken, validateApiKey } from '@/lib/agent/api-keys';

export async function POST(request: NextRequest) {
  try {
    const apiKey = extractBearerToken(request);
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 });
    }

    const agent = await validateApiKey(apiKey);
    if (!agent) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }

    const body = await request.json();

    await prisma.agent.update({
      where: { id: agent.id },
      data: {
        lastSeenAt: new Date(),
        status: 'ACTIVE',
        metadata: {
          activeScans: body.activeScans ?? 0,
          uptimeSeconds: body.uptimeSeconds ?? 0,
          lastHeartbeatStatus: body.status ?? 'idle',
        },
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Heartbeat error:', error);
    return NextResponse.json({ error: 'Heartbeat failed' }, { status: 500 });
  }
}
