import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { RegistryService } from '@/lib/registry/RegistryService'

const registryService = new RegistryService(prisma)

export async function GET() {
  try {
    const repositories = await registryService.listRepositories()
    return NextResponse.json(repositories)
  } catch (error) {
    console.error('Failed to fetch repositories:', error)
    return NextResponse.json(
      { error: 'Failed to fetch repositories' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, type, registryUrl, username, password, organization, protocol, skipTlsVerify, testConnection = true } = body

    if (!name || !type || !username || !password) {
      return NextResponse.json(
        { error: 'Missing required fields: name, type, username, password' },
        { status: 400 }
      )
    }

    const { repository, testResult } = await registryService.createRepository({
      name,
      type,
      registryUrl,
      username,
      password,
      organization,
      protocol,
      skipTlsVerify,
      testConnection
    })

    return NextResponse.json({
      id: repository.id,
      name: repository.name,
      type: repository.type,
      protocol: repository.protocol,
      registryUrl: repository.registryUrl,
      username: repository.username,
      status: repository.status,
      repositoryCount: repository.repositoryCount,
      capabilities: repository.capabilities || null,
      rateLimits: repository.rateLimits || null,
      testResult
    })
  } catch (error) {
    console.error('Failed to create repository:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to create repository'
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}