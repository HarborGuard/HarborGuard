import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const repositories = await prisma.repository.findMany({
      select: {
        id: true,
        name: true,
        type: true,
        protocol: true,
        registryUrl: true,
        username: true,
        lastTested: true,
        status: true,
        repositoryCount: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

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
    const { name, type, registryUrl, username, password, organization, testResult } = body

    if (!name || !type || !username || !password) {
      return NextResponse.json(
        { error: 'Missing required fields: name, type, username, password' },
        { status: 400 }
      )
    }

    if (type === 'generic' && !registryUrl) {
      return NextResponse.json(
        { error: 'Registry URL is required for generic registry type' },
        { status: 400 }
      )
    }

    // Extract protocol from registryUrl if present
    let protocol = 'https'
    let cleanRegistryUrl = registryUrl || (type === 'dockerhub' ? 'docker.io' : type === 'ghcr' ? 'ghcr.io' : '')
    
    if (cleanRegistryUrl) {
      if (cleanRegistryUrl.startsWith('http://')) {
        protocol = 'http'
        cleanRegistryUrl = cleanRegistryUrl.substring(7)
      } else if (cleanRegistryUrl.startsWith('https://')) {
        protocol = 'https'
        cleanRegistryUrl = cleanRegistryUrl.substring(8)
      }
      // Remove trailing slash
      cleanRegistryUrl = cleanRegistryUrl.replace(/\/$/, '')
    }

    // Determine status based on test results
    let status: 'ACTIVE' | 'ERROR' | 'UNTESTED' = 'UNTESTED'
    let repositoryCount: number | undefined
    let lastTested: Date | undefined
    
    if (testResult) {
      status = testResult.success ? 'ACTIVE' : 'ERROR'
      repositoryCount = testResult.repositoryCount
      lastTested = new Date()
    }

    // For security, we'll encrypt the password/token before storing
    // For now, we'll store it as plain text but in production you should encrypt it
    const repository = await prisma.repository.create({
      data: {
        name,
        type: type.toUpperCase() as 'DOCKERHUB' | 'GHCR' | 'GENERIC',
        protocol,
        registryUrl: cleanRegistryUrl,
        username,
        encryptedPassword: password, // Should be encrypted
        organization,
        status,
        repositoryCount,
        lastTested,
      },
    })

    return NextResponse.json({
      id: repository.id,
      name: repository.name,
      type: repository.type,
      protocol: repository.protocol,
      registryUrl: repository.registryUrl,
      username: repository.username,
      status: repository.status,
    })
  } catch (error) {
    console.error('Failed to create repository:', error)
    return NextResponse.json(
      { error: 'Failed to create repository' },
      { status: 500 }
    )
  }
}