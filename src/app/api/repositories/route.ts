import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { RegistryService } from '@/lib/registry/RegistryService'
import { apiError } from '@/lib/api-utils'

const registryService = new RegistryService(prisma)

export async function GET() {
  try {
    const repositories = await registryService.listRepositories()
    return NextResponse.json(repositories)
  } catch (error) {
    return apiError(error, 'Failed to fetch repositories');
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, type, registryUrl, username, password, organization, protocol, skipTlsVerify, registryPort, testConnection = true } = body

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
      registryPort,
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
    return apiError(error, 'Failed to create repository');
  }
}