import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { RegistryService } from '@/lib/registry/RegistryService'
import { RegistryProviderFactory } from '@/lib/registry/providers/RegistryProviderFactory'
import type { Repository } from '@/generated/prisma'

const registryService = new RegistryService(prisma)

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { type, registryUrl, username, password, organization, skipTlsVerify, registryPort } = body

    console.log('[Test Connection] Request received:', {
      type,
      registryUrl,
      username,
      organization,
      skipTlsVerify,
      registryPort,
      hasPassword: !!password
    })

    if (!type || !username || !password) {
      console.error('[Test Connection] Missing required fields')
      return NextResponse.json(
        { error: 'Missing required fields: type, username, password' },
        { status: 400 }
      )
    }

    if (type === 'generic' && !registryUrl) {
      return NextResponse.json(
        { error: 'Registry URL is required for generic registry type' },
        { status: 400 }
      )
    }

    try {
      // Create a temporary repository object for testing
      const upperType = type.toUpperCase() as any
      
      // Process registry URL and protocol
      let protocol = 'https'
      let cleanRegistryUrl = registryUrl || ''
      
      if (upperType === 'DOCKERHUB') {
        cleanRegistryUrl = 'docker.io'
      } else if (upperType === 'GHCR') {
        cleanRegistryUrl = 'ghcr.io'
      } else if (upperType === 'GITLAB') {
        // For GitLab, keep the full URL with protocol
        // The GitLabHandler will parse it and determine the registry and auth URLs
        if (!cleanRegistryUrl.startsWith('http://') && !cleanRegistryUrl.startsWith('https://')) {
          cleanRegistryUrl = `https://${cleanRegistryUrl}`
        }
      } else {
        // For other types, strip the protocol
        if (cleanRegistryUrl) {
          if (cleanRegistryUrl.startsWith('http://')) {
            protocol = 'http'
            cleanRegistryUrl = cleanRegistryUrl.substring(7)
          } else if (cleanRegistryUrl.startsWith('https://')) {
            protocol = 'https'
            cleanRegistryUrl = cleanRegistryUrl.substring(8)
          }
          cleanRegistryUrl = cleanRegistryUrl.replace(/\/$/, '')
        }
      }

      const tempRepository: Repository = {
        id: 'temp-test',
        name: 'Test Connection',
        type: upperType,
        protocol,
        registryUrl: cleanRegistryUrl,
        username,
        encryptedPassword: password,
        organization: organization || null,
        authUrl: null,
        groupId: null,
        skipTlsVerify: skipTlsVerify || false,
        registryPort: registryPort || null,
        status: 'UNTESTED',
        lastTested: null,
        repositoryCount: null,
        apiVersion: null,
        capabilities: null,
        rateLimits: null,
        healthCheck: null,
        createdAt: new Date(),
        updatedAt: new Date()
      }

      console.log('[Test Connection] Created temp repository:', {
        type: tempRepository.type,
        registryUrl: tempRepository.registryUrl,
        protocol: tempRepository.protocol,
        skipTlsVerify: tempRepository.skipTlsVerify,
        registryPort: tempRepository.registryPort
      })

      // Validate configuration
      const validation = RegistryProviderFactory.validateConfiguration(tempRepository)
      if (!validation.valid) {
        console.error('[Test Connection] Validation failed:', validation.errors)
        return NextResponse.json({
          success: false,
          error: `Invalid configuration: ${validation.errors.join(', ')}`
        })
      }

      console.log('[Test Connection] Creating provider for type:', upperType)
      // Test connection using provider
      const provider = RegistryProviderFactory.create(upperType, tempRepository)
      
      console.log('[Test Connection] Testing connection...')
      const result = await provider.testConnection()
      
      console.log('[Test Connection] Test result:', {
        success: result.success,
        repositoryCount: result.repositoryCount,
        error: result.error,
        message: result.message
      })

      return NextResponse.json({
        success: result.success,
        repositoryCount: result.repositoryCount,
        error: result.success ? undefined : result.message
      })
    } catch (connectionError) {
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