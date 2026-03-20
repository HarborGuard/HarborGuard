import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { RegistryService } from '@/lib/registry/RegistryService'
import { apiError } from '@/lib/api-utils'

const registryService = new RegistryService(prisma)

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await registryService.deleteRepository(id)
    return NextResponse.json({ success: true })
  } catch (error) {
    return apiError(error, 'Failed to delete repository');
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    
    // Update the repository directly in database
    const updated = await prisma.repository.update({
      where: { id },
      data: {
        ...(body.registryUrl !== undefined && { registryUrl: body.registryUrl }),
        ...(body.skipTlsVerify !== undefined && { skipTlsVerify: body.skipTlsVerify }),
        ...(body.registryPort !== undefined && { registryPort: body.registryPort }),
        ...(body.username !== undefined && { username: body.username }),
        ...(body.password !== undefined && { encryptedPassword: body.password }),
        updatedAt: new Date()
      }
    })
    
    // Invalidate cache after update
    await registryService.invalidateCache(id)
    
    const { encryptedPassword, ...safeUpdated } = updated
    return NextResponse.json(safeUpdated)
  } catch (error) {
    return apiError(error, 'Failed to update repository');
  }
}