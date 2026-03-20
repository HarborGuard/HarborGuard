import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { RegistryService } from '@/lib/registry/RegistryService'
import { apiError } from '@/lib/api-utils'

const CreateRepositorySchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(['DOCKERHUB', 'GHCR', 'GITLAB', 'GENERIC', 'ECR', 'GCR', 'ACR', 'HARBOR', 'NEXUS', 'ARTIFACTORY', 'QUAY']),
  registryUrl: z.string().url().optional(),
  username: z.string().min(1),
  password: z.string().min(1),
  organization: z.string().optional(),
  protocol: z.string().optional(),
  skipTlsVerify: z.boolean().optional(),
  registryPort: z.number().int().positive().optional().nullable(),
  testConnection: z.boolean().optional().default(true),
})

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
    const parsed = CreateRepositorySchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues },
        { status: 400 }
      )
    }

    const { name, type, registryUrl, username, password, organization, protocol, skipTlsVerify, registryPort, testConnection } = parsed.data

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