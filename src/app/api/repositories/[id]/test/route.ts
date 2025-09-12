import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { RegistryService } from '@/lib/registry/RegistryService'

const registryService = new RegistryService(prisma)

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const testResult = await registryService.testConnection(id)

    return NextResponse.json(testResult)
  } catch (error) {
    console.error('Failed to test repository connection:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to test connection'
    
    return NextResponse.json({
      success: false,
      message: errorMessage,
      error: errorMessage
    }, { 
      status: error instanceof Error && error.message.includes('not found') ? 404 : 500 
    })
  }
}