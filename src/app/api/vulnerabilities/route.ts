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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '1000');
    const offset = parseInt(searchParams.get('offset') || '0');
    const search = searchParams.get('search') || '';
    const severity = searchParams.get('severity') || '';

    // Build where clause for filtering
    const whereClause: any = {};
    if (severity) {
      whereClause.severity = severity.toUpperCase();
    }
    if (search) {
      whereClause.OR = [
        { cveId: { contains: search, mode: 'insensitive' } },
        { packageName: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { title: { contains: search, mode: 'insensitive' } }
      ];
    }

    // Get vulnerability findings from normalized tables with aggregation
    const vulnerabilityFindings = await prisma.scanVulnerabilityFinding.findMany({
      where: whereClause,
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

    // Get all CVE classifications to check for false positives
    const allClassifications = await prisma.cveClassification.findMany({
      include: {
        imageVulnerability: {
          include: {
            vulnerability: true
          }
        }
      }
    });

    const classificationMap = new Map<string, Map<string, boolean>>();
    allClassifications.forEach(classification => {
      const cveId = classification.imageVulnerability?.vulnerability?.cveId;
      const imageId = classification.imageId;
      if (cveId && imageId) {
        if (!classificationMap.has(cveId)) {
          classificationMap.set(cveId, new Map());
        }
        classificationMap.get(cveId)!.set(imageId, classification.isFalsePositive);
      }
    });

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
      affectedImages: Map<string, {
        imageName: string;
        imageId: string;
        isFalsePositive: boolean;
      }>;
      sources: Set<string>;
    }>();

    // Process all vulnerability findings
    for (const finding of vulnerabilityFindings) {
      const cveId = finding.cveId;
      
      // Check if this CVE is marked as false positive for this image
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
          affectedImages: new Map(),
          sources: new Set()
        });
      } else {
        // Update to highest severity if this one is higher
        const existing = cveMap.get(cveId)!;
        if (getSeverityPriority(finding.severity) > getSeverityPriority(existing.severity)) {
          existing.severity = finding.severity;
        }
        // Update CVSS if higher
        if (finding.cvssScore && (!existing.cvssScore || finding.cvssScore > existing.cvssScore)) {
          existing.cvssScore = finding.cvssScore;
        }
        // Update description if empty
        if (!existing.description && (finding.description || finding.title)) {
          existing.description = finding.description || finding.title || '';
        }
      }

      const cveData = cveMap.get(cveId)!;

      // Add package information
      if (finding.packageName) {
        cveData.packageNames.add(finding.packageName);
      }

      // Add fixed version information
      if (finding.fixedVersion) {
        cveData.fixedVersions.add(finding.fixedVersion);
      }

      // Add vulnerability URL as reference
      if (finding.vulnerabilityUrl) {
        cveData.references.add(finding.vulnerabilityUrl);
      }

      // Add scanner source
      cveData.sources.add(finding.source);

      // Add affected image (using imageId as key to avoid duplicates)
      cveData.affectedImages.set(finding.scan.imageId, {
        imageName: finding.scan.image.name,
        imageId: finding.scan.imageId,
        isFalsePositive
      });
    }

    // Also check for correlations to get multi-scanner consensus
    const correlations = await prisma.scanFindingCorrelation.findMany({
      where: {
        findingType: 'vulnerability'
      },
      select: {
        correlationKey: true,
        sources: true,
        sourceCount: true,
        confidenceScore: true
      }
    });

    // Add correlation data to CVEs
    const correlationMap = new Map<string, any>();
    correlations.forEach(corr => {
      correlationMap.set(corr.correlationKey, corr);
    });

    // Convert to array and apply filters
    let vulnerabilities = Array.from(cveMap.values()).map(cve => {
      const correlation = correlationMap.get(cve.cveId);
      return {
        cveId: cve.cveId,
        severity: cve.severity,
        description: cve.description,
        cvssScore: cve.cvssScore,
        packageName: Array.from(cve.packageNames)[0], // Just show first package for simplicity
        affectedImages: Array.from(cve.affectedImages.values()),
        totalAffectedImages: cve.affectedImages.size,
        falsePositiveImages: Array.from(cve.affectedImages.values())
          .filter(img => img.isFalsePositive)
          .map(img => img.imageName),
        fixedVersion: Array.from(cve.fixedVersions)[0], // Just show first fixed version
        publishedDate: cve.publishedDate?.toISOString(),
        references: Array.from(cve.references),
        sources: Array.from(cve.sources),
        sourceCount: correlation?.sourceCount || cve.sources.size,
        confidenceScore: correlation?.confidenceScore
      };
    });

    // Sort by severity (critical > high > medium > low > unknown)
    const severityPriority: { [key: string]: number } = {
      'CRITICAL': 5,
      'HIGH': 4,
      'MEDIUM': 3,
      'LOW': 2,
      'INFO': 1,
      'UNKNOWN': 0
    };

    vulnerabilities.sort((a, b) => {
      const aPriority = severityPriority[a.severity] || 0;
      const bPriority = severityPriority[b.severity] || 0;
      if (bPriority !== aPriority) {
        return bPriority - aPriority; // Descending order
      }
      // Secondary sort by source count (more sources = higher confidence)
      return (b.sourceCount || 1) - (a.sourceCount || 1);
    });

    // Apply pagination
    const total = vulnerabilities.length;
    const paginatedVulnerabilities = vulnerabilities.slice(offset, offset + limit);

    return NextResponse.json({
      vulnerabilities: paginatedVulnerabilities,
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