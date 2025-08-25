import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
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

    let repositories = []

    try {
      switch (repository.type) {
        case 'DOCKERHUB':
          repositories = await getDockerHubRepositories(
            repository.username,
            repository.encryptedPassword, // Should be decrypted
            repository.organization || undefined
          )
          break

        case 'GHCR':
          repositories = await getGHCRRepositories(
            repository.username,
            repository.encryptedPassword, // Should be decrypted
            repository.organization || undefined
          )
          break

        case 'GENERIC':
          repositories = await getGenericRegistryRepositories(
            repository.registryUrl,
            repository.username,
            repository.encryptedPassword // Should be decrypted
          )
          break

        default:
          throw new Error(`Unsupported repository type: ${repository.type}`)
      }

      return NextResponse.json(repositories)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch repositories'
      return NextResponse.json(
        { error: errorMessage },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('Failed to fetch repository images:', error)
    return NextResponse.json(
      { error: 'Failed to fetch repository images' },
      { status: 500 }
    )
  }
}

async function getDockerHubRepositories(username: string, password: string, organization?: string): Promise<any[]> {
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
  const namespace = organization || username
  const repoResponse = await fetch(`https://hub.docker.com/v2/repositories/${namespace}/?page_size=100`, {
    headers: {
      'Authorization': `JWT ${token}`,
    },
  })

  if (!repoResponse.ok) {
    throw new Error('Failed to fetch Docker Hub repositories')
  }

  const repoData = await repoResponse.json()
  return repoData.results.map((repo: any) => ({
    name: `${namespace}/${repo.name}`, // Include namespace for proper image reference
    description: repo.description,
    isPrivate: repo.is_private,
    starCount: repo.star_count,
    pullCount: repo.pull_count,
    lastUpdated: repo.last_updated,
  }))
}

async function getGHCRRepositories(username: string, token: string, organization?: string): Promise<any[]> {
  const repositories = []

  // Get user packages
  const userPackagesResponse = await fetch('https://api.github.com/user/packages?package_type=container', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
    },
  })

  if (userPackagesResponse.ok) {
    const userPackages = await userPackagesResponse.json()
    repositories.push(...userPackages.map((pkg: any) => ({
      name: pkg.name,
      description: pkg.description,
      isPrivate: pkg.visibility === 'private',
      createdAt: pkg.created_at,
      updatedAt: pkg.updated_at,
    })))
  }

  // Get organization packages if provided
  if (organization) {
    const orgPackagesResponse = await fetch(`https://api.github.com/orgs/${organization}/packages?package_type=container`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    })

    if (orgPackagesResponse.ok) {
      const orgPackages = await orgPackagesResponse.json()
      repositories.push(...orgPackages.map((pkg: any) => ({
        name: pkg.name,
        description: pkg.description,
        isPrivate: pkg.visibility === 'private',
        createdAt: pkg.created_at,
        updatedAt: pkg.updated_at,
      })))
    }
  }

  return repositories
}

async function getGenericRegistryRepositories(registryUrl: string, username: string, password: string): Promise<any[]> {
  const auth = Buffer.from(`${username}:${password}`).toString('base64')
  
  const catalogResponse = await fetch(`https://${registryUrl}/v2/_catalog`, {
    headers: {
      'Authorization': `Basic ${auth}`,
    },
  })

  if (!catalogResponse.ok) {
    throw new Error(`Registry catalog request failed (${catalogResponse.status})`)
  }

  const catalogData = await catalogResponse.json()
  
  return (catalogData.repositories || []).map((name: string) => ({
    name,
    description: `Registry image: ${name}`,
    isPrivate: true,
  }))
}