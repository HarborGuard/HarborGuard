import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { RegistryService } from '@/lib/registry/RegistryService'
import { apiError } from '@/lib/api-utils'

const UpdateRepositorySchema = z.object({
  registryUrl: z.string().min(1).optional(),
  skipTlsVerify: z.boolean().optional(),
  registryPort: z.number().int().positive().optional().nullable(),
  username: z.string().min(1).optional(),
  password: z.string().min(1).optional(),
  organization: z.string().optional().nullable(),
})

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
    const parsed = UpdateRepositorySchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues },
        { status: 400 }
      )
    }

    const data = parsed.data

    // Update the repository directly in database
    const updated = await prisma.repository.update({
      where: { id },
      data: {
        ...(data.registryUrl !== undefined && { registryUrl: data.registryUrl }),
        ...(data.skipTlsVerify !== undefined && { skipTlsVerify: data.skipTlsVerify }),
        ...(data.registryPort !== undefined && { registryPort: data.registryPort }),
        ...(data.username !== undefined && { username: data.username }),
        ...(data.password !== undefined && { encryptedPassword: data.password }),
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