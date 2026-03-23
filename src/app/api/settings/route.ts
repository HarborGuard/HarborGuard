import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const ALLOWED_KEYS: Record<string, { min?: number; max?: number; type: 'number' | 'boolean' }> = {
  cleanupOldScansDays: { min: 1, max: 365, type: 'number' },
  cleanupAuditLogsDays: { min: 1, max: 365, type: 'number' },
  cleanupBulkScansDays: { min: 1, max: 365, type: 'number' },
  cleanupS3Artifacts: { type: 'boolean' },
};

const DEFAULTS: Record<string, string> = {
  cleanupOldScansDays: '30',
  cleanupAuditLogsDays: '30',
  cleanupBulkScansDays: '30',
  cleanupS3Artifacts: 'true',
};

export async function GET() {
  try {
    const rows = await prisma.appSetting.findMany();
    const settings: Record<string, string> = { ...DEFAULTS };
    for (const row of rows) {
      settings[row.key] = row.value;
    }
    return NextResponse.json(settings);
  } catch (error) {
    console.error('Failed to load settings:', error);
    return NextResponse.json(DEFAULTS);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const errors: string[] = [];
    const updates: { key: string; value: string }[] = [];

    for (const [key, rawValue] of Object.entries(body)) {
      const rule = ALLOWED_KEYS[key];
      if (!rule) {
        errors.push(`Unknown setting: ${key}`);
        continue;
      }

      if (rule.type === 'number') {
        const num = Number(rawValue);
        if (!Number.isInteger(num)) {
          errors.push(`${key} must be an integer`);
          continue;
        }
        if (rule.min !== undefined && num < rule.min) {
          errors.push(`${key} must be at least ${rule.min}`);
          continue;
        }
        if (rule.max !== undefined && num > rule.max) {
          errors.push(`${key} must be at most ${rule.max}`);
          continue;
        }
        updates.push({ key, value: String(num) });
      } else if (rule.type === 'boolean') {
        const val = String(rawValue).toLowerCase();
        if (val !== 'true' && val !== 'false') {
          errors.push(`${key} must be true or false`);
          continue;
        }
        updates.push({ key, value: val });
      }
    }

    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join(', ') }, { status: 400 });
    }

    for (const { key, value } of updates) {
      await prisma.appSetting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      });
    }

    // Return full settings after update
    const rows = await prisma.appSetting.findMany();
    const settings: Record<string, string> = { ...DEFAULTS };
    for (const row of rows) {
      settings[row.key] = row.value;
    }

    return NextResponse.json(settings);
  } catch (error) {
    console.error('Failed to update settings:', error);
    return NextResponse.json(
      { error: 'Failed to update settings' },
      { status: 500 }
    );
  }
}
