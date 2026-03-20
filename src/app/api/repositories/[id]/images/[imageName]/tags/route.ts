import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { RegistryService } from '@/lib/registry/RegistryService'
import { apiError } from '@/lib/api-utils'

const registryService = new RegistryService(prisma)

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; imageName: string }> }
) {
  try {
    const { id, imageName } = await params
    const { searchParams } = new URL(request.url)
    
    const namespace = searchParams.get('namespace') || null
    const forceRefresh = searchParams.get('forceRefresh') === 'true'

    console.log('[Tags API] Request received:', {
      repositoryId: id,
      imageName,
      namespace,
      forceRefresh,
      decodedImageName: decodeURIComponent(imageName)
    })

    const tags = await registryService.getTags(id, namespace, imageName, {
      forceRefresh
    })

    console.log('[Tags API] Tags fetched successfully:', {
      repositoryId: id,
      imageName,
      namespace,
      tagCount: tags.length,
      tags: tags.map(t => t.name)
    })

    return NextResponse.json(tags)
  } catch (error) {
    const status = error instanceof Error && error.message.includes('not found') ? 404 : 500;
    return apiError(error, 'Failed to fetch image tags', status);
  }
}