import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { RegistryService } from '@/lib/registry/RegistryService'

const registryService = new RegistryService(prisma)

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined
    const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!, 10) : undefined
    const namespace = searchParams.get('namespace') || undefined
    const query = searchParams.get('query') || undefined
    const forceRefresh = searchParams.get('forceRefresh') === 'true'

    const images = await registryService.listImages(id, {
      limit,
      offset,
      namespace,
      query,
      forceRefresh
    })

    return NextResponse.json(images)
  } catch (error) {
    console.error('Failed to fetch repository images:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch repository images'
    
    return NextResponse.json(
      { error: errorMessage },
      { status: error instanceof Error && error.message.includes('not found') ? 404 : 500 }
    )
  }
}