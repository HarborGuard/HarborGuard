import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const repository = await prisma.repository.findUnique({
      where: { id },
    })

    if (!repository) {
      return NextResponse.json(
        { error: 'Repository not found' },
        { status: 404 }
      )
    }

    // Test connection based on repository type
    let repositoryCount = 0
    let success = false

    try {
      switch (repository.type) {
        case 'DOCKERHUB':
          repositoryCount = await testDockerHubConnection(
            repository.username,
            repository.encryptedPassword // Should be decrypted
          )
          success = true
          break

        case 'GHCR':
          repositoryCount = await testGHCRConnection(
            repository.username,
            repository.encryptedPassword, // Should be decrypted
            repository.organization || undefined
          )
          success = true
          break

        case 'GENERIC':
          // Combine protocol and registryUrl for testing
          const fullUrl = `${repository.protocol || 'https'}://${repository.registryUrl}`
          repositoryCount = await testGenericRegistryConnection(
            fullUrl,
            repository.username,
            repository.encryptedPassword // Should be decrypted
          )
          success = true
          break

        default:
          throw new Error(`Unsupported repository type: ${repository.type}`)
      }

      // Update repository status
      await prisma.repository.update({
        where: { id },
        data: {
          status: 'ACTIVE',
          lastTested: new Date(),
          repositoryCount,
        },
      })

      return NextResponse.json({
        success: true,
        repositoryCount,
      })
    } catch (connectionError) {
      // Update repository status to error
      await prisma.repository.update({
        where: { id },
        data: {
          status: 'ERROR',
          lastTested: new Date(),
        },
      })

      const errorMessage = connectionError instanceof Error ? connectionError.message : 'Connection test failed'
      return NextResponse.json({
        success: false,
        error: errorMessage,
      })
    }
  } catch (error) {
    console.error('Failed to test repository connection:', error)
    return NextResponse.json(
      { error: 'Failed to test connection' },
      { status: 500 }
    )
  }
}

async function testDockerHubConnection(username: string, password: string): Promise<number> {
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

  // Get repositories
  const repoResponse = await fetch(`https://hub.docker.com/v2/repositories/${username}/?page_size=100`, {
    headers: {
      'Authorization': `JWT ${token}`,
    },
  })

  if (!repoResponse.ok) {
    throw new Error('Failed to fetch Docker Hub repositories')
  }

  const repoData = await repoResponse.json()
  return repoData.count || 0
}

async function testGHCRConnection(username: string, token: string, organization?: string): Promise<number> {
  let repositoryCount = 0

  // Test user packages
  const userPackagesResponse = await fetch('https://api.github.com/user/packages?package_type=container', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
    },
  })

  if (userPackagesResponse.ok) {
    const userPackages = await userPackagesResponse.json()
    repositoryCount += userPackages.length
  }

  // Test organization packages if provided
  if (organization) {
    const orgPackagesResponse = await fetch(`https://api.github.com/orgs/${organization}/packages?package_type=container`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    })

    if (orgPackagesResponse.ok) {
      const orgPackages = await orgPackagesResponse.json()
      repositoryCount += orgPackages.length
    }
  }

  if (repositoryCount === 0) {
    throw new Error('No container packages found or authentication failed')
  }

  return repositoryCount
}

async function testGenericRegistryConnection(registryUrl: string, username: string, password: string): Promise<number> {
  const auth = Buffer.from(`${username}:${password}`).toString('base64')
  
  // For API calls, ensure we have a protocol
  let url = registryUrl
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`
  }
  
  // Ensure the URL ends properly for the catalog endpoint
  if (!url.endsWith('/')) {
    url += '/'
  }
  
  // Test catalog endpoint
  const catalogResponse = await fetch(`${url}v2/_catalog`, {
    headers: {
      'Authorization': `Basic ${auth}`,
    },
  })

  if (!catalogResponse.ok) {
    throw new Error(`Registry authentication failed (${catalogResponse.status})`)
  }

  const catalogData = await catalogResponse.json()
  return catalogData.repositories?.length || 0
}