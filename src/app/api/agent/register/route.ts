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
        hostname: body.hostname ?? null,
        os: body.os ?? null,
        arch: body.arch ?? null,
        sensorVersion: body.version ?? null,
        scannerVersions: body.scannerVersions ?? null,
        capabilities: body.capabilities ?? [],
        s3Configured: body.s3Configured ?? false,
        lastSeenAt: new Date(),
        status: 'ACTIVE',
      },
    });

    return NextResponse.json({ agentId: agent.id });
  } catch (error) {
    console.error('Agent registration error:', error);
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
  }
}
