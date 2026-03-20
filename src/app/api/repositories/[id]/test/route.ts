import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { RegistryService } from '@/lib/registry/RegistryService'
import { apiError } from '@/lib/api/api-utils'

const registryService = new RegistryService(prisma)

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    console.log('[Test Repository API] Testing connection for repository ID:', id)

    const testResult = await registryService.testConnection(id)
    console.log('[Test Repository API] Test result:', testResult)

    return NextResponse.json(testResult)
  } catch (error) {
    const status = error instanceof Error && error.message.includes('not found') ? 404 : 500;
    return apiError(error, 'Failed to test connection', status);
  }
}