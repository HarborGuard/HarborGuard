import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; imageName: string }> }
) {
  try {
    const { id, imageName } = await params

    const repository = await prisma.repository.findUnique({
      where: { id },
    })

    if (!repository) {
      return NextResponse.json(
        { error: 'Repository not found' },
        { status: 404 }
      )
    }

    let tags = []

    try {
      switch (repository.type) {
        case 'DOCKERHUB':
          tags = await getDockerHubTags(
            repository.username,
            repository.encryptedPassword, // Should be decrypted
            imageName,
            repository.organization || undefined
          )
          break

        case 'GHCR':
          tags = await getGHCRTags(
            repository.username,
            repository.encryptedPassword, // Should be decrypted
            imageName,
            repository.organization || undefined
          )
          break

        case 'GENERIC':
          tags = await getGenericRegistryTags(
            repository.registryUrl,
            repository.username,
            repository.encryptedPassword, // Should be decrypted
            imageName
          )
          break

        default:
          throw new Error(`Unsupported repository type: ${repository.type}`)
      }

      return NextResponse.json(tags)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch tags'
      return NextResponse.json(
        { error: errorMessage },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('Failed to fetch image tags:', error)
    return NextResponse.json(
      { error: 'Failed to fetch image tags' },
      { status: 500 }
    )
  }
}

async function getDockerHubTags(username: string, password: string, imageName: string, organization?: string): Promise<any[]> {
  // Login to Docker Hub
  const loginResponse = await fetch('https://hub.docker.com/v2/users/login/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username, password }),
  })

  if (!loginResponse.ok) {
    throw new Error('Docker Hub authentication failed')
  }

  const loginData = await loginResponse.json()
  const token = loginData.token

  // imageName already includes the namespace (e.g., "bmasspm/test-harborguard")
  // so we can use it directly
  const tagsResponse = await fetch(`https://hub.docker.com/v2/repositories/${imageName}/tags/?page_size=100`, {
    headers: {
      'Authorization': `JWT ${token}`,
    },
  })

  if (!tagsResponse.ok) {
    throw new Error('Failed to fetch Docker Hub tags')
  }

  const tagsData = await tagsResponse.json()
  return tagsData.results.map((tag: any) => ({
    name: tag.name,
    size: tag.full_size,
    lastUpdated: tag.last_updated,
    digest: tag.digest,
  }))
}

async function getGHCRTags(username: string, token: string, imageName: string, organization?: string): Promise<any[]> {
  const owner = organization || username
  
  // Use Docker Registry v2 API directly
  const tagsResponse = await fetch(`https://ghcr.io/v2/${owner}/${imageName}/tags/list`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  })

  if (!tagsResponse.ok) {
    throw new Error(`Failed to fetch GHCR tags (${tagsResponse.status})`)
  }

  const tagsData = await tagsResponse.json()
  return (tagsData.tags || []).map((tag: string) => ({
    name: tag,
    size: null, // Size not available from tags/list endpoint
    lastUpdated: null,
    digest: null,
  }))
}

async function getGenericRegistryTags(registryUrl: string, username: string, password: string, imageName: string): Promise<any[]> {
  const auth = Buffer.from(`${username}:${password}`).toString('base64')
  
  const tagsResponse = await fetch(`https://${registryUrl}/v2/${imageName}/tags/list`, {
    headers: {
      'Authorization': `Basic ${auth}`,
    },
  })

  if (!tagsResponse.ok) {
    throw new Error(`Registry tags request failed (${tagsResponse.status})`)
  }

  const tagsData = await tagsResponse.json()
  
  return (tagsData.tags || []).map((tag: string) => ({
    name: tag,
    size: null,
    lastUpdated: null,
    digest: null,
  }))
}