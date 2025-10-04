import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface VulnerabilityData {
  cveId: string;
  severity: string;
  description?: string;
  cvssScore?: number;
  packageName?: string;
  affectedImages: Array<{
    imageName: string;
    imageId: string;
    isFalsePositive: boolean;
  }>;
  totalAffectedImages: number;
  falsePositiveImages: string[];
  fixedVersion?: string;
  publishedDate?: string;
  references?: string[];
}

// Helper function to get severity priority (higher number = higher severity)
const getSeverityPriority = (severity: string) => {
  const priority: { [key: string]: number } = {
    'CRITICAL': 5,
    'HIGH': 4,
    'MEDIUM': 3,
    'LOW': 2,
    'INFO': 1,
    'UNKNOWN': 0
  };
  return priority[severity] || 0;
};

// Severity order for SQL sorting (maps to numeric priority)
const SEVERITY_ORDER = `
  CASE severity
    WHEN 'CRITICAL' THEN 5
    WHEN 'HIGH' THEN 4
    WHEN 'MEDIUM' THEN 3
    WHEN 'LOW' THEN 2
    WHEN 'INFO' THEN 1
    ELSE 0
  END
`;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const search = searchParams.get('search') || '';
    const severity = searchParams.get('severity') || '';
    const maxAffectedImages = 10; // Limit affected images per CVE to reduce payload

    // Step 1: Get unique CVE IDs with aggregated data using Prisma groupBy
    // Build the where clause
    const findingWhere: any = {};
    if (severity) {
      findingWhere.severity = severity.toUpperCase();
    }
    if (search) {
      findingWhere.OR = [
        { cveId: { contains: search, mode: 'insensitive' } },
        { packageName: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { title: { contains: search, mode: 'insensitive' } }
      ];
    }

    // Get total count
    const totalCount = await prisma.scanVulnerabilityFinding.groupBy({
      by: ['cveId'],
      where: findingWhere
    });

    const total = totalCount.length;

    // Get aggregated CVEs with pagination
    const aggregatedCVEs = await prisma.scanVulnerabilityFinding.groupBy({
      by: ['cveId'],
      where: findingWhere,
      _max: {
        cvssScore: true
      },
      _count: {
        scanId: true
      },
      orderBy: {
        _max: {
          cvssScore: 'desc'
        }
      },
      skip: offset,
      take: limit
    });

    // Get severity for each CVE (need separate query since groupBy doesn't handle CASE well)
    const cveIdsForPage = aggregatedCVEs.map(cve => cve.cveId);

    const severityData = await prisma.scanVulnerabilityFinding.findMany({
      where: {
        cveId: { in: cveIdsForPage }
      },
      select: {
        cveId: true,
        severity: true,
        cvssScore: true
      },
      orderBy: {
        severity: 'desc'
      }
    });

    // Map to get highest severity per CVE
    const severityMap = new Map<string, string>();
    severityData.forEach(s => {
      const currentPriority = severityMap.has(s.cveId)
        ? getSeverityPriority(severityMap.get(s.cveId)!)
        : -1;
      const newPriority = getSeverityPriority(s.severity);
      if (newPriority > currentPriority) {
        severityMap.set(s.cveId, s.severity);
      }
    });

    // Sort CVEs by severity priority, then CVSS score
    const sortedCveIds = aggregatedCVEs
      .map(cve => ({
        cveId: cve.cveId,
        severity: severityMap.get(cve.cveId) || 'UNKNOWN',
        maxCvssScore: cve._max.cvssScore
      }))
      .sort((a, b) => {
        const aPriority = getSeverityPriority(a.severity);
        const bPriority = getSeverityPriority(b.severity);
        if (bPriority !== aPriority) {
          return bPriority - aPriority;
        }
        const aScore = a.maxCvssScore || 0;
        const bScore = b.maxCvssScore || 0;
        return bScore - aScore;
      })
      .map(item => item.cveId);

    // Step 2: Get detailed data only for CVEs in current page
    if (sortedCveIds.length === 0) {
      return NextResponse.json({
        vulnerabilities: [],
        pagination: {
          total: 0,
          limit,
          offset,
          hasMore: false
        }
      });
    }

    const vulnerabilityFindings = await prisma.scanVulnerabilityFinding.findMany({
      where: {
        cveId: { in: sortedCveIds }
      },
      include: {
        scan: {
          include: {
            image: true
          }
        }
      },
      orderBy: [
        { severity: 'desc' },
        { cvssScore: 'desc' },
        { cveId: 'asc' }
      ]
    });

    // Get classifications only for these CVEs and their images
    const imageIds = [...new Set(vulnerabilityFindings.map(f => f.scan.imageId))];
    const classifications = await prisma.cveClassification.findMany({
      where: {
        imageId: { in: imageIds }
      },
      include: {
        imageVulnerability: {
          include: {
            vulnerability: true
          }
        }
      }
    });

    const classificationMap = new Map<string, Map<string, boolean>>();
    classifications.forEach(classification => {
      const cveId = classification.imageVulnerability?.vulnerability?.cveId;
      const imageId = classification.imageId;
      if (cveId && imageId) {
        if (!classificationMap.has(cveId)) {
          classificationMap.set(cveId, new Map());
        }
        classificationMap.get(cveId)!.set(imageId, classification.isFalsePositive);
      }
    });

    // Group vulnerabilities by CVE ID
    const cveMap = new Map<string, {
      cveId: string;
      severity: string;
      description: string;
      cvssScore?: number;
      packageNames: Set<string>;
      fixedVersions: Set<string>;
      publishedDate?: Date;
      references: Set<string>;
      affectedImages: Array<{
        imageName: string;
        imageId: string;
        isFalsePositive: boolean;
      }>;
      sources: Set<string>;
    }>();

    // Process findings
    for (const finding of vulnerabilityFindings) {
      const cveId = finding.cveId;

      const imageClassifications = classificationMap.get(cveId);
      const isFalsePositive = imageClassifications?.get(finding.scan.imageId) || false;

      if (!cveMap.has(cveId)) {
        cveMap.set(cveId, {
          cveId,
          severity: finding.severity,
          description: finding.description || finding.title || '',
          cvssScore: finding.cvssScore || undefined,
          packageNames: new Set(),
          fixedVersions: new Set(),
          publishedDate: finding.publishedDate || undefined,
          references: new Set(),
          affectedImages: [],
          sources: new Set()
        });
      } else {
        const existing = cveMap.get(cveId)!;
        if (getSeverityPriority(finding.severity) > getSeverityPriority(existing.severity)) {
          existing.severity = finding.severity;
        }
        if (finding.cvssScore && (!existing.cvssScore || finding.cvssScore > existing.cvssScore)) {
          existing.cvssScore = finding.cvssScore;
        }
        if (!existing.description && (finding.description || finding.title)) {
          existing.description = finding.description || finding.title || '';
        }
      }

      const cveData = cveMap.get(cveId)!;

      if (finding.packageName) {
        cveData.packageNames.add(finding.packageName);
      }

      if (finding.fixedVersion) {
        cveData.fixedVersions.add(finding.fixedVersion);
      }

      if (finding.vulnerabilityUrl) {
        cveData.references.add(finding.vulnerabilityUrl);
      }

      cveData.sources.add(finding.source);

      // Only add if we haven't reached the limit for affected images
      if (cveData.affectedImages.length < maxAffectedImages) {
        const imageAlreadyAdded = cveData.affectedImages.some(
          img => img.imageId === finding.scan.imageId
        );

        if (!imageAlreadyAdded) {
          cveData.affectedImages.push({
            imageName: finding.scan.image.name,
            imageId: finding.scan.imageId,
            isFalsePositive
          });
        }
      }
    }

    // Get correlations only for current page CVEs
    const correlations = await prisma.scanFindingCorrelation.findMany({
      where: {
        findingType: 'vulnerability',
        correlationKey: { in: sortedCveIds }
      },
      select: {
        correlationKey: true,
        sources: true,
        sourceCount: true,
        confidenceScore: true
      }
    });

    const correlationMap = new Map<string, any>();
    correlations.forEach(corr => {
      correlationMap.set(corr.correlationKey, corr);
    });

    // Convert to array (already sorted)
    const vulnerabilities = sortedCveIds.map(cveId => {
      const cve = cveMap.get(cveId)!;
      const correlation = correlationMap.get(cveId);
      const aggregated = aggregatedCVEs.find(a => a.cveId === cveId);

      return {
        cveId: cve.cveId,
        severity: cve.severity,
        description: cve.description,
        cvssScore: cve.cvssScore,
        packageName: Array.from(cve.packageNames)[0],
        affectedImages: cve.affectedImages,
        totalAffectedImages: aggregated?._count?.scanId || cve.affectedImages.length,
        falsePositiveImages: cve.affectedImages
          .filter(img => img.isFalsePositive)
          .map(img => img.imageName),
        fixedVersion: Array.from(cve.fixedVersions)[0],
        publishedDate: cve.publishedDate?.toISOString(),
        references: Array.from(cve.references),
        sources: Array.from(cve.sources),
        sourceCount: correlation?.sourceCount || cve.sources.size,
        confidenceScore: correlation?.confidenceScore
      };
    });

    return NextResponse.json({
      vulnerabilities,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total
      }
    });

  } catch (error) {
    console.error('Failed to fetch vulnerabilities:', error);
    return NextResponse.json(
      { error: 'Failed to fetch vulnerabilities' },
      { status: 500 }
    );
  }
}