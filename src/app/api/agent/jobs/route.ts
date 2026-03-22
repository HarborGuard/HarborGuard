import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { extractBearerToken, validateApiKey } from '@/lib/agent/api-keys';

export async function GET(request: NextRequest) {
  try {
    const apiKey = extractBearerToken(request);
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 });
    }

    const agent = await validateApiKey(apiKey);
    if (!agent) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }

    // Find pending jobs (unassigned or assigned to this agent)
    const jobs = await prisma.agentJob.findMany({
      where: {
        OR: [
          { status: 'PENDING', agentId: null },
          { status: 'PENDING', agentId: agent.id },
        ],
      },
      take: 5,
      orderBy: { createdAt: 'asc' },
    });

    // Filter by agent capabilities (patch jobs require 'patch' capability)
    const filteredJobs = jobs.filter(
      (j) => j.type === 'SCAN' || (j.type === 'PATCH' && agent.capabilities.includes('patch')),
    );

    // Atomically claim jobs — only succeed if still PENDING
    const claimedJobs = [];
    for (const job of filteredJobs) {
      const result = await prisma.agentJob.updateMany({
        where: { id: job.id, status: 'PENDING' },
        data: { agentId: agent.id, status: 'ASSIGNED', assignedAt: new Date() },
      });
      if (result.count > 0) {
        claimedJobs.push(job);
      }
    }

    return NextResponse.json(
      claimedJobs.map((j) => ({
        id: j.id,
        type: j.type,
        createdAt: j.createdAt.toISOString(),
        ...(j.payload as object),
      })),
    );
  } catch (error) {
    console.error('Job polling error:', error);
    return NextResponse.json({ error: 'Failed to poll jobs' }, { status: 500 });
  }
}
