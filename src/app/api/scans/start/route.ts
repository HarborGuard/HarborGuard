/**
 * @swagger
 * /api/scans/start:
 *   post:
 *     summary: Start container scan(s)
 *     description: Initiates security scan(s) for container image(s). Supports both single and batch requests.
 *     tags: [Scans]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - type: object
 *                 description: Single scan request
 *                 properties:
 *                   image:
 *                     type: string
 *                     description: Image name
 *                     example: nginx
 *                   tag:
 *                     type: string
 *                     description: Image tag
 *                     example: latest
 *                   source:
 *                     type: string
 *                     enum: [registry, local]
 *                     description: Image source
 *                   dockerImageId:
 *                     type: string
 *                     description: Docker image ID for local images
 *                   repositoryId:
 *                     type: string
 *                     description: Repository ID for private registries
 *               - type: object
 *                 description: Batch scan request
 *                 properties:
 *                   scans:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         image:
 *                           type: string
 *                         tag:
 *                           type: string
 *                         source:
 *                           type: string
 *                         dockerImageId:
 *                           type: string
 *                         repositoryId:
 *                           type: string
 *                   priority:
 *                     type: number
 *                     description: Scan priority (-10 to 10)
 *     responses:
 *       200:
 *         description: Scan(s) started successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
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

// Single scan item schema
const SingleScanSchema = z.object({
  // Legacy format (for backwards compatibility)
  imageName: z.string().min(1).optional(),
  imageTag: z.string().min(1).optional(),
  registry: z.string().optional(),
  
  // New format
  image: z.string().min(1).optional(),
  tag: z.string().min(1).optional(),
  source: z.enum(['registry', 'local', 'tar']).optional(),
  dockerImageId: z.string().optional(),
  repositoryId: z.string().optional(), // For private repositories
  tarPath: z.string().optional(), // Path to tar file for direct tar scanning
  registryType: z.enum(['DOCKERHUB', 'GHCR', 'GENERIC', 'ECR', 'GCR', 'GITLAB']).optional(), // Hint for registry type
}).refine(
  (data) => 
    // Either legacy format, new format, or tar path must be provided
    (data.imageName && data.imageTag) || (data.image && data.tag) || data.tarPath,
  {
    message: "Either (imageName & imageTag), (image & tag), or tarPath must be provided"
  }
)

// Batch scan request schema
const BatchScanSchema = z.object({
  scans: z.array(SingleScanSchema).min(1).max(100), // Limit batch size to 100
  priority: z.number().min(-10).max(10).optional().default(0),
})

// Combined schema that accepts either single or batch
const ScanStartSchema = z.union([
  SingleScanSchema,
  BatchScanSchema,
])

// Process a single scan request
async function processSingleScan(validatedData: any, request: NextRequest, priority: number = 0) {
  // Handle tar file scanning if tarPath is provided
  if (validatedData.tarPath) {
    
    // Extract image name from tar path if possible
    const pathParts = validatedData.tarPath.split('/')
    const filename = pathParts[pathParts.length - 1]
    const imageName = validatedData.image || filename.replace('.tar', '').replace('.gz', '')
    const imageTag = validatedData.tag || 'latest'
    
    // Convert to ScanRequest format for tar file
    const scanRequest: ScanRequest = {
      image: imageName,
      tag: imageTag,
      source: 'tar',
      tarPath: validatedData.tarPath,
    }
    
    // Start scan with tar file
    const result = await scannerService.startScan(scanRequest, priority)
    
    // Log the scan start action
    await auditLogger.scanStart(
      request, 
      `tar:${filename}`, 
      'tar'
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
    
    return response
  }
  
  // Handle both legacy and new format
  const imageName = validatedData.image || validatedData.imageName!
  const imageTag = validatedData.tag || validatedData.imageTag!
  
  
  // Convert to ScanRequest format
  const scanRequest: ScanRequest = {
    image: imageName,
    tag: imageTag,
    registry: validatedData.registry,
    source: validatedData.source,
    dockerImageId: validatedData.dockerImageId,
    repositoryId: validatedData.repositoryId,
    registryType: validatedData.registryType,
  }
  
  // Start scan with specified priority
  const result = await scannerService.startScan(scanRequest, priority)
  
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
  
  return response
}

// Process batch scan requests
async function processBatchScans(scans: any[], priority: number, request: NextRequest) {
  const results = []
  
  // Process scans in parallel with concurrency limit
  const BATCH_CONCURRENCY = 5 // Process 5 scans at a time
  
  for (let i = 0; i < scans.length; i += BATCH_CONCURRENCY) {
    const batch = scans.slice(i, i + BATCH_CONCURRENCY)
    const batchResults = await Promise.allSettled(
      batch.map(async (scanData) => {
        try {
          const result = await processSingleScan(scanData, request, priority)
          return {
            ...result,
            image: scanData.image || scanData.imageName,
            tag: scanData.tag || scanData.imageTag,
          }
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to start scan',
            image: scanData.image || scanData.imageName,
            tag: scanData.tag || scanData.imageTag,
          }
        }
      })
    )
    
    // Extract results from Promise.allSettled
    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value)
      } else {
        results.push({
          success: false,
          error: result.reason?.message || 'Unknown error',
        })
      }
    }
  }
  
  return results
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // Validate request data
    const validatedData = ScanStartSchema.parse(body)
    
    // Check if this is a batch request
    if ('scans' in validatedData) {
      // Handle batch scan request
      const results = await processBatchScans(
        validatedData.scans, 
        validatedData.priority || 0, 
        request
      )
      
      return NextResponse.json({
        success: true,
        batch: true,
        results,
        summary: {
          total: results.length,
          successful: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length,
          queued: results.filter(r => r.queued).length,
        }
      }, { status: 201 })
    }
    
    // Handle single scan request
    const result = await processSingleScan(validatedData, request, 0)
    return NextResponse.json(result, { status: 201 })
    
  } catch (error) {
    console.error('Failed to start scan:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: 'Invalid request data',
        details: error.issues
      }, { status: 400 })
    }
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start scan'
    }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json(
    { message: 'Use POST to start a scan' },
    { status: 405 }
  )
}