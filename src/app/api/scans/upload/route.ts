import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import type { ScanUploadRequest } from '@/types'
import { apiError } from '@/lib/api/api-utils'
import { extractBearerToken, validateApiKey } from '@/lib/agent/api-keys'
import { ingestEnvelope } from '@/lib/scanner/SensorBridge'

// Validation schema for legacy scan upload
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

function isLocalRequest(request: NextRequest): boolean {
  const forwarded = request.headers.get('x-forwarded-for')
  const realIP = request.headers.get('x-real-ip')
  const ip = forwarded?.split(',')[0] || realIP || 'localhost'
  const allowedIPs = ['127.0.0.1', '::1', 'localhost', '::ffff:127.0.0.1']
  return allowedIPs.some(a => ip === a) ||
    isRfc1918_172(ip) ||
    ip.startsWith('10.')
}

function isRfc1918_172(ip: string): boolean {
  if (!ip.startsWith('172.')) return false
  const secondOctet = parseInt(ip.split('.')[1], 10)
  return secondOctet >= 16 && secondOctet <= 31
}

export async function POST(request: NextRequest) {
  try {
    // Authentication: API key OR localhost
    const apiKey = extractBearerToken(request)
    let agentId: string | null = null

    if (apiKey) {
      const agent = await validateApiKey(apiKey)
      if (!agent) {
        return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
      }
      agentId = agent.id
    } else if (process.env.NODE_ENV === 'production' && !isLocalRequest(request)) {
      return NextResponse.json(
        { error: 'Access denied: provide an API key or call from localhost' },
        { status: 403 },
      )
    }

    const body = await request.json()

    // Detect format: ScanEnvelope (version: '1.0') vs legacy
    if (body.version === '1.0' && body.findings) {
      return handleEnvelopeUpload(body, agentId)
    }

    // Legacy format
    const validatedData = ScanUploadSchema.parse(body)

    const existingScan = await prisma.scan.findUnique({
      where: { requestId: validatedData.requestId },
    })
    if (existingScan) {
      return NextResponse.json(
        { error: 'Scan with this requestId already exists', scanId: existingScan.id },
        { status: 409 },
      )
    }

    let image = await prisma.image.findUnique({
      where: { digest: validatedData.image.digest },
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
        },
      })
    }

    const scanMetadata = await prisma.scanMetadata.create({
      data: {
        ...(validatedData.scan.scannerVersions && { scannerVersions: validatedData.scan.scannerVersions }),
      },
    })

    const scan = await prisma.scan.create({
      data: {
        requestId: validatedData.requestId,
        imageId: image.id,
        tag: validatedData.image.tag,
        startedAt: new Date(validatedData.scan.startedAt),
        finishedAt: validatedData.scan.finishedAt ? new Date(validatedData.scan.finishedAt) : null,
        status: validatedData.scan.status,
        reportsDir: validatedData.scan.reportsDir,
        errorMessage: validatedData.scan.errorMessage,
        metadataId: scanMetadata.id,
      },
    })

    await updateScanAggregates(scan.id, validatedData.reports)

    return NextResponse.json({ success: true, scanId: scan.id, imageId: image.id }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation error', details: error.issues }, { status: 400 })
    }
    return apiError(error, 'Error uploading scan data')
  }
}

// ---------------------------------------------------------------------------
// Envelope format handler (sensor v1.0)
// ---------------------------------------------------------------------------

async function handleEnvelopeUpload(envelope: any, agentId: string | null) {
  const envelopeScanId = envelope.scan?.id
  if (!envelopeScanId) {
    return NextResponse.json({ error: 'Missing scan.id in envelope' }, { status: 400 })
  }

  // Check if this envelope is from an agent-dispatched job.
  // The sensor uses the AgentJob ID as envelope.scan.id, so look up the linked scan.
  const agentJob = await prisma.agentJob.findUnique({
    where: { id: envelopeScanId },
    select: { scanId: true },
  })

  if (agentJob?.scanId) {
    // Update the existing scan that the dashboard created when it dispatched the job
    const existingScan = await prisma.scan.findUnique({ where: { id: agentJob.scanId } })
    if (existingScan) {
      await prisma.scan.update({
        where: { id: existingScan.id },
        data: {
          status: envelope.scan.status === 'FAILED' ? 'FAILED' : envelope.scan.status === 'PARTIAL' ? 'PARTIAL' : 'SUCCESS',
          riskScore: envelope.aggregates?.riskScore ?? null,
          finishedAt: envelope.scan.finishedAt ? new Date(envelope.scan.finishedAt) : new Date(),
          source: 'sensor',
        },
      })

      // Update image with digest if we have one now
      const digest = envelope.image?.digest
      if (digest) {
        await prisma.image.update({
          where: { id: existingScan.imageId },
          data: {
            digest,
            platform: envelope.image?.platform ?? undefined,
            sizeBytes: envelope.image?.sizeBytes ? BigInt(envelope.image.sizeBytes) : undefined,
          },
        }).catch(() => {
          // digest uniqueness conflict — image already exists with this digest, that's fine
        })
      }

      await ingestEnvelope(existingScan.id, envelope)
      return NextResponse.json({ success: true, scanId: existingScan.id, imageId: existingScan.imageId }, { status: 200 })
    }
  }

  // No linked agent job — standalone upload (CLI one-shot or direct upload)
  const existingScan = await prisma.scan.findUnique({ where: { requestId: envelopeScanId } })
  if (existingScan) {
    return NextResponse.json(
      { error: 'Scan with this requestId already exists', scanId: existingScan.id },
      { status: 409 },
    )
  }

  const digest = envelope.image?.digest || `sensor:${envelopeScanId}`

  const image = await prisma.image.upsert({
    where: { digest },
    update: {
      name: envelope.image?.name || 'unknown',
      tag: envelope.image?.tag || 'latest',
    },
    create: {
      name: envelope.image?.name || 'unknown',
      tag: envelope.image?.tag || 'latest',
      source: 'REGISTRY',
      digest,
      platform: envelope.image?.platform ?? null,
      sizeBytes: envelope.image?.sizeBytes ? BigInt(envelope.image.sizeBytes) : null,
    },
  })

  const scan = await prisma.scan.create({
    data: {
      requestId: envelopeScanId,
      imageId: image.id,
      tag: envelope.image?.tag || 'latest',
      startedAt: new Date(envelope.scan.startedAt),
      finishedAt: envelope.scan.finishedAt ? new Date(envelope.scan.finishedAt) : null,
      status: envelope.scan.status,
      riskScore: envelope.aggregates?.riskScore ?? null,
      source: agentId ? 'sensor' : 'upload',
    },
  })

  await ingestEnvelope(scan.id, envelope)
  return NextResponse.json({ success: true, scanId: scan.id, imageId: image.id }, { status: 201 })
}

// ---------------------------------------------------------------------------
// Legacy aggregate calculation
// ---------------------------------------------------------------------------

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

            if (vuln.CVSS?.redhat?.V3Score || vuln.CVSS?.nvd?.V3Score) {
              const score = vuln.CVSS.redhat?.V3Score || vuln.CVSS.nvd?.V3Score
              totalCvssScore += score
              cvssCount++
            }
          }
        }
      }

      aggregates.vulnerabilityCount = vulnCount
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
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json(
    { message: 'Scan upload endpoint. Use POST to upload scan data.' },
    { status: 200 }
  )
}
