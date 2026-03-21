import crypto from 'crypto';
import { prisma } from '@/lib/prisma';

const API_KEY_PREFIX = 'hg_ak_';

export function generateApiKey(): { key: string; hash: string } {
  const raw = `${API_KEY_PREFIX}${crypto.randomBytes(16).toString('hex')}`;
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  return { key: raw, hash };
}

export async function validateApiKey(key: string): Promise<{ id: string; name: string; capabilities: string[] } | null> {
  if (!key || !key.startsWith(API_KEY_PREFIX)) return null;

  const hash = crypto.createHash('sha256').update(key).digest('hex');

  const agent = await prisma.agent.findFirst({
    where: { apiKeyHash: hash, status: { in: ['ACTIVE', 'DISCONNECTED'] } },
    select: { id: true, name: true, capabilities: true },
  });

  return agent;
}

export function extractBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7);
}
