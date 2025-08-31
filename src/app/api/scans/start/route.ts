/**
 * @swagger
 * /api/scans/start:
 *   post:
 *     summary: Start a new container scan
 *     description: Initiates a security scan for a container image
 *     tags: [Scans]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               image:
 *                 type: string
 *                 description: Image name
 *                 example: nginx
 *               tag:
 *                 type: string
 *                 description: Image tag
 *                 example: latest
 *               source:
 *                 type: string
 *                 enum: [registry, local]
 *                 description: Image source
 *               dockerImageId:
 *                 type: string
 *                 description: Docker image ID for local images
 *               repositoryId:
 *                 type: string
 *                 description: Repository ID for private registries
 *     responses:
 *       200:
 *         description: Scan started successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 requestId:
 *                   type: string
 *                 message:
 *                   type: string
 *       400:
 *         description: Invalid request data
 *       500:
 *         description: Internal server error
 */

import { NextRequest, NextResponse } from 'next/server'
import { scannerService } from '@/lib/scanner'
import { z } from 'zod'
import type { ScanRequest } from '@/types'
import { auditLogger } from '@/lib/audit-logger'

// Validation schema for scan start request - supports both old and new format
const ScanStartSchema = z.object({
  // Legacy format (for backwards compatibility)
  imageName: z.string().min(1).optional(),
  imageTag: z.string().min(1).optional(),
  registry: z.string().optional(),
  
  // New format
  image: z.string().min(1).optional(),
  tag: z.string().min(1).optional(),
  source: z.enum(['registry', 'local']).optional(),
  dockerImageId: z.string().optional(),
  repositoryId: z.string().optional(), // For private repositories
}).refine(
  (data) => 
    // Either legacy format or new format must be provided
    (data.imageName && data.imageTag) || (data.image && data.tag),
  {
    message: "Either (imageName & imageTag) or (image & tag) must be provided"
  }
)

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // Validate request data
    const validatedData = ScanStartSchema.parse(body)
    
    // Handle both legacy and new format
    const imageName = validatedData.image || validatedData.imageName!
    const imageTag = validatedData.tag || validatedData.imageTag!
    
    console.log(`Starting scan for ${imageName}:${imageTag}${validatedData.source === 'local' ? ' (local Docker image)' : ''}`)
    
    // Convert to ScanRequest format
    const scanRequest: ScanRequest = {
      image: imageName,
      tag: imageTag,
      registry: validatedData.registry,
      source: validatedData.source,
      dockerImageId: validatedData.dockerImageId,
      repositoryId: validatedData.repositoryId,
    }
    
    // Start scan with normal priority
    const result = await scannerService.startScan(scanRequest, 0)
    
    // Log the scan start action
    await auditLogger.scanStart(
      request, 
      `${imageName}:${imageTag}`, 
      validatedData.source || 'registry'
    );
    
    // Include queue information in response
    const response: any = {
      success: true,
      requestId: result.requestId,
      scanId: result.scanId,
      message: result.queued ? 'Scan queued successfully' : 'Scan started successfully'
    }
    
    if (result.queued) {
      response.queued = true;
      response.queuePosition = result.queuePosition;
      response.estimatedWaitTime = scannerService.getEstimatedWaitTime(result.requestId);
    }
    
    return NextResponse.json(response, { status: 201 })

  } catch (error) {
    console.error('Error starting scan:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      )
    }
    
    return NextResponse.json(
      { 
        error: 'Failed to start scan', 
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json(
    { message: 'Scan start endpoint. Use POST to start a scan.' },
    { status: 200 }
  )
}