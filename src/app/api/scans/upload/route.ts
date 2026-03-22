import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import type { ScanUploadRequest } from '@/types'
import { apiError } from '@/lib/api/api-utils'
import { extractBearerToken, validateApiKey } from '@/lib/agent/api-keys'

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
  const allowedIPs = ['127.0.0.1', '::1', 'localhost']
  return allowedIPs.some(a => ip.includes(a)) ||
    ip.startsWith('172.') ||
    ip.startsWith('10.') ||
    ip === 'unknown'
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
  const requestId = envelope.scan?.id
  if (!requestId) {
    return NextResponse.json({ error: 'Missing scan.id in envelope' }, { status: 400 })
  }

  const existingScan = await prisma.scan.findUnique({ where: { requestId } })
  if (existingScan) {
    return NextResponse.json(
      { error: 'Scan with this requestId already exists', scanId: existingScan.id },
      { status: 409 },
    )
  }

  // Generate a stable digest if not provided
  const digest = envelope.image?.digest || `sensor:${requestId}`

  // 1. Upsert image
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

  // 2. Create scan
  const scan = await prisma.scan.create({
    data: {
      requestId,
      imageId: image.id,
      tag: envelope.image?.tag || 'latest',
      startedAt: new Date(envelope.scan.startedAt),
      finishedAt: envelope.scan.finishedAt ? new Date(envelope.scan.finishedAt) : null,
      status: envelope.scan.status,
      riskScore: envelope.aggregates?.riskScore ?? null,
      source: agentId ? 'sensor' : 'upload',
    },
  })

  // 3. Create metadata
  await prisma.scanMetadata.create({
    data: {
      scan: { connect: { id: scan.id } },
      vulnerabilityCritical: envelope.aggregates?.vulnerabilityCounts?.critical ?? 0,
      vulnerabilityHigh: envelope.aggregates?.vulnerabilityCounts?.high ?? 0,
      vulnerabilityMedium: envelope.aggregates?.vulnerabilityCounts?.medium ?? 0,
      vulnerabilityLow: envelope.aggregates?.vulnerabilityCounts?.low ?? 0,
      vulnerabilityInfo: envelope.aggregates?.vulnerabilityCounts?.info ?? 0,
      aggregatedRiskScore: envelope.aggregates?.riskScore ?? null,
      complianceScore: envelope.aggregates?.complianceScore ?? null,
      complianceGrade: envelope.aggregates?.complianceGrade ?? null,
      scannerVersions: envelope.sensor?.scannerVersions ?? null,
      s3Prefix: envelope.artifacts?.s3Prefix ?? null,
    },
  })

  // 4. Bulk insert normalized findings
  const findings = envelope.findings || {}

  if (findings.vulnerabilities?.length > 0) {
    await prisma.scanVulnerabilityFinding.createMany({
      data: findings.vulnerabilities.map((v: any) => ({
        scanId: scan.id,
        source: v.source,
        cveId: v.cveId,
        packageName: v.packageName,
        installedVersion: v.installedVersion ?? null,
        fixedVersion: v.fixedVersion ?? null,
        severity: mapSeverityToEnum(v.severity),
        cvssScore: v.cvssScore ?? null,
        title: v.title ?? null,
        description: v.description ?? null,
        vulnerabilityUrl: v.vulnerabilityUrl ?? null,
      })),
    })
  }

  if (findings.packages?.length > 0) {
    await prisma.scanPackageFinding.createMany({
      data: findings.packages.map((p: any) => ({
        scanId: scan.id,
        source: p.source,
        packageName: p.name,
        version: p.version ?? null,
        type: p.type || 'unknown',
        purl: p.purl ?? null,
        license: p.license ?? null,
      })),
    })
  }

  if (findings.compliance?.length > 0) {
    await prisma.scanComplianceFinding.createMany({
      data: findings.compliance.map((c: any) => ({
        scanId: scan.id,
        source: c.source,
        ruleId: c.ruleId,
        ruleName: c.ruleName,
        category: c.category || 'General',
        severity: mapSeverityToEnum(c.severity),
        message: c.message || '',
      })),
    })
  }

  if (findings.efficiency?.length > 0) {
    await prisma.scanEfficiencyFinding.createMany({
      data: findings.efficiency.map((e: any) => ({
        scanId: scan.id,
        source: e.source,
        findingType: e.findingType,
        severity: e.severity || 'INFO',
        sizeBytes: e.sizeBytes ? BigInt(e.sizeBytes) : null,
        description: e.details || e.title || '',
      })),
    })
  }

  return NextResponse.json({ success: true, scanId: scan.id, imageId: image.id }, { status: 201 })
}

function mapSeverityToEnum(severity: string): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO' {
  const upper = severity?.toUpperCase()
  if (['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'].includes(upper)) {
    return upper as any
  }
  return 'INFO'
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
