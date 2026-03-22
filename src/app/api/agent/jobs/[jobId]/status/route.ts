import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { extractBearerToken, validateApiKey } from '@/lib/agent/api-keys';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const apiKey = extractBearerToken(request);
    if (!apiKey) {
      return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 });
    }

    const agent = await validateApiKey(apiKey);
    if (!agent) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }

    const { jobId } = await params;
    const body = await request.json();
    const { status, error: errorMessage } = body;

    if (!['completed', 'failed'].includes(status)) {
      return NextResponse.json({ error: 'Status must be "completed" or "failed"' }, { status: 400 });
    }

    const job = await prisma.agentJob.findUnique({ where: { id: jobId } });
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }
    if (job.agentId !== agent.id) {
      return NextResponse.json({ error: 'Job not assigned to this agent' }, { status: 403 });
    }
    if (job.status === 'COMPLETED' || job.status === 'FAILED') {
      return NextResponse.json({ error: 'Job already finalized' }, { status: 409 });
    }

    await prisma.agentJob.update({
      where: { id: jobId },
      data: {
        status: status === 'completed' ? 'COMPLETED' : 'FAILED',
        completedAt: new Date(),
        errorMessage: errorMessage ?? null,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Job status update error:', error);
    return NextResponse.json({ error: 'Failed to update job status' }, { status: 500 });
  }
}
