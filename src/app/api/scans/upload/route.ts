import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import type { ScanUploadRequest } from '@/types'

// Validation schema for scan upload
const ScanUploadSchema = z.object({
  requestId: z.string(),
  image: z.object({
    name: z.string(),
    tag: z.string(),
    registry: z.string().optional(),
    digest: z.string(),
    platform: z.string().optional(),
    sizeBytes: z.number().optional(),
  }),
  scan: z.object({
    startedAt: z.string(),
    finishedAt: z.string().optional(),
    sizeBytes: z.number().optional(),
    status: z.enum(['RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED', 'CANCELLED']),
    reportsDir: z.string().optional(),
    errorMessage: z.string().optional(),
    scannerVersions: z.record(z.string(), z.string()).optional(),
    scanConfig: z.record(z.string(), z.unknown()).optional(),
  }),
  reports: z.object({
    trivy: z.unknown().optional(),
    grype: z.unknown().optional(),
    syft: z.unknown().optional(),
    dockle: z.unknown().optional(),
    metadata: z.unknown().optional(),
  }).optional(),
})

type ScanUploadData = z.infer<typeof ScanUploadSchema>

export async function POST(request: NextRequest) {
  try {
    // Check if request is from localhost/container only
    const forwarded = request.headers.get('x-forwarded-for')
    const realIP = request.headers.get('x-real-ip')
    const ip = forwarded?.split(',')[0] || realIP || 'localhost'
    
    // For development, allow localhost. In production, you'd want stricter checks
    const allowedIPs = ['127.0.0.1', '::1', 'localhost']
    const isAllowed = allowedIPs.some(allowedIP => ip.includes(allowedIP)) || 
                     ip.startsWith('172.') || 
                     ip.startsWith('10.') || 
                     ip === 'unknown'
                     
    if (process.env.NODE_ENV === 'production' && !isAllowed) {
      return NextResponse.json(
        { error: 'Access denied: This endpoint is only accessible from the local container' },
        { status: 403 }
      )
    }

    const body = await request.json()
    
    // Validate request data
    const validatedData = ScanUploadSchema.parse(body)
    
    // Check if scan with same requestId already exists
    const existingScan = await prisma.scan.findUnique({
      where: { requestId: validatedData.requestId }
    })
    
    if (existingScan) {
      return NextResponse.json(
        { error: 'Scan with this requestId already exists', scanId: existingScan.id },
        { status: 409 }
      )
    }

    // Create or find image
    let image = await prisma.image.findUnique({
      where: { digest: validatedData.image.digest }
    })
    
    if (!image) {
      image = await prisma.image.create({
        data: {
          name: validatedData.image.name,
          tag: validatedData.image.tag,
          source: 'REGISTRY',
          digest: validatedData.image.digest,
          platform: validatedData.image.platform,
          sizeBytes: validatedData.image.sizeBytes ? BigInt(validatedData.image.sizeBytes) : null,
        }
      })
    }

    // Create scan record
    const scan = await prisma.scan.create({
      data: {
        requestId: validatedData.requestId,
        imageId: image.id,
        startedAt: new Date(validatedData.scan.startedAt),
        finishedAt: validatedData.scan.finishedAt ? new Date(validatedData.scan.finishedAt) : null,
        status: validatedData.scan.status,
        reportsDir: validatedData.scan.reportsDir,
        errorMessage: validatedData.scan.errorMessage,
        metadata: {
          ...(validatedData.reports?.metadata || {}),
          scannerVersions: validatedData.scan.scannerVersions
        } as any,
      }
    })

    // Calculate aggregated data for quick access
    await updateScanAggregates(scan.id, validatedData.reports)

    return NextResponse.json({
      success: true,
      scanId: scan.id,
      imageId: image.id,
    }, { status: 201 })

  } catch (error) {
    console.error('Error uploading scan data:', error)
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.issues },
        { status: 400 }
      )
    }
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Helper function to compute and store aggregated vulnerability/risk data
async function updateScanAggregates(scanId: string, reports: ScanUploadData['reports']) {
  if (!reports) return

  try {
    const aggregates: {
      vulnerabilityCount?: any
      riskScore?: number
      complianceScore?: any
    } = {}

    // Process Trivy vulnerabilities
    const trivyReport = reports.trivy as any
    if (trivyReport?.Results) {
      const vulnCount = { critical: 0, high: 0, medium: 0, low: 0, info: 0 }
      let totalCvssScore = 0
      let cvssCount = 0

      for (const result of trivyReport.Results) {
        if (result.Vulnerabilities) {
          for (const vuln of result.Vulnerabilities) {
            const severity = vuln.Severity?.toLowerCase()
            if (severity && vulnCount.hasOwnProperty(severity)) {
              vulnCount[severity as keyof typeof vulnCount]++
            }
            
            // Extract CVSS score for risk calculation
            if (vuln.CVSS?.redhat?.V3Score || vuln.CVSS?.nvd?.V3Score) {
              const score = vuln.CVSS.redhat?.V3Score || vuln.CVSS.nvd?.V3Score
              totalCvssScore += score
              cvssCount++
            }
          }
        }
      }

      aggregates.vulnerabilityCount = vulnCount
      
      // Calculate basic risk score (0-100) based on vulnerability counts and CVSS
      const totalVulns = Object.values(vulnCount).reduce((sum, count) => sum + count, 0)
      const avgCvss = cvssCount > 0 ? totalCvssScore / cvssCount : 0
      
      aggregates.riskScore = Math.min(100, Math.round(
        (vulnCount.critical * 25) +
        (vulnCount.high * 10) +
        (vulnCount.medium * 3) +
        (vulnCount.low * 1) +
        (avgCvss * 5)
      ))
    }

    // Process Grype vulnerabilities (similar logic)
    const grypeReport = reports.grype as any
    if (grypeReport?.matches && !trivyReport?.Results) {
      const vulnCount = { critical: 0, high: 0, medium: 0, low: 0, info: 0 }
      
      for (const match of grypeReport.matches) {
        const severity = match.vulnerability.severity?.toLowerCase()
        if (severity && vulnCount.hasOwnProperty(severity)) {
          vulnCount[severity as keyof typeof vulnCount]++
        }
      }
      
      aggregates.vulnerabilityCount = vulnCount
      aggregates.riskScore = Math.min(100, Math.round(
        (vulnCount.critical * 25) +
        (vulnCount.high * 10) +
        (vulnCount.medium * 3) +
        (vulnCount.low * 1)
      ))
    }

    // Process Dockle compliance
    const dockleReport = reports.dockle as any
    if (dockleReport?.summary) {
      const { fatal, warn, info, pass } = dockleReport.summary
      const total = fatal + warn + info + pass
      const complianceScore = total > 0 ? Math.round((pass / total) * 100) : 0
      
      aggregates.complianceScore = {
        dockle: {
          score: complianceScore,
          grade: complianceScore >= 90 ? 'A' : complianceScore >= 80 ? 'B' : complianceScore >= 70 ? 'C' : 'D',
          fatal,
          warn,
          info,
          pass,
        }
      }
    }

    // Update scan with aggregated data
    if (Object.keys(aggregates).length > 0) {
      await prisma.scan.update({
        where: { id: scanId },
        data: aggregates
      })
    }
  } catch (error) {
    console.error('Error calculating scan aggregates:', error)
    // Don't fail the whole operation if aggregation fails
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json(
    { message: 'Scan upload endpoint. Use POST to upload scan data.' },
    { status: 200 }
  )
}