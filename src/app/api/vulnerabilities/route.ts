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
    const includeTotal = searchParams.get('includeTotal') !== 'false';
    const maxAffectedImages = 10;

    // Build WHERE clause for SQL
    let whereConditions: string[] = [];
    let params: any[] = [];
    let paramIndex = 1;

    if (severity) {
      whereConditions.push(`severity::text = $${paramIndex}`);
      params.push(severity.toUpperCase());
      paramIndex++;
    }

    if (search) {
      const searchPattern = `%${search}%`;
      whereConditions.push(`("cveId" ILIKE $${paramIndex} OR "packageName" ILIKE $${paramIndex} OR description ILIKE $${paramIndex} OR title ILIKE $${paramIndex})`);
      params.push(searchPattern);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Single optimized query to get paginated, sorted CVEs with all aggregations
    // Uses composite indexes on (cveId, severity, cvssScore) for efficient window function
    // and (cveId, scanId) for efficient COUNT DISTINCT
    const cveAggregations = await prisma.$queryRawUnsafe<Array<{
      cveId: string;
      severity: string;
      maxCvssScore: number | null;
      scanCount: bigint;
      description: string | null;
      packageName: string | null;
    }>>(
      `
      WITH cve_aggregates AS (
        SELECT
          "cveId",
          MAX(CASE severity::text
            WHEN 'CRITICAL' THEN 5
            WHEN 'HIGH' THEN 4
            WHEN 'MEDIUM' THEN 3
            WHEN 'LOW' THEN 2
            WHEN 'INFO' THEN 1
            ELSE 0
          END) as severity_priority,
          MAX("cvssScore") as "maxCvssScore",
          COUNT(DISTINCT "scanId") as "scanCount"
        FROM "scan_vulnerability_findings"
        ${whereClause}
        GROUP BY "cveId"
        ORDER BY severity_priority DESC, "maxCvssScore" DESC NULLS LAST, "cveId" ASC
        LIMIT $${paramIndex}
        OFFSET $${paramIndex + 1}
      ),
      top_findings AS (
        SELECT DISTINCT ON (svf."cveId")
          svf."cveId",
          svf.severity::text as severity,
          svf.description,
          svf."packageName"
        FROM "scan_vulnerability_findings" svf
        INNER JOIN cve_aggregates ca ON ca."cveId" = svf."cveId"
        ORDER BY svf."cveId",
          CASE svf.severity::text
            WHEN 'CRITICAL' THEN 5
            WHEN 'HIGH' THEN 4
            WHEN 'MEDIUM' THEN 3
            WHEN 'LOW' THEN 2
            WHEN 'INFO' THEN 1
            ELSE 0
          END DESC,
          svf."cvssScore" DESC NULLS LAST
      )
      SELECT
        ca."cveId",
        tf.severity,
        ca."maxCvssScore",
        ca."scanCount",
        tf.description,
        tf."packageName"
      FROM cve_aggregates ca
      INNER JOIN top_findings tf ON tf."cveId" = ca."cveId"
      ORDER BY ca.severity_priority DESC, ca."maxCvssScore" DESC NULLS LAST, ca."cveId" ASC
      `,
      ...params,
      limit,
      offset
    );

    const finalCveIds = cveAggregations.map(c => c.cveId);

    if (finalCveIds.length === 0) {
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

    // Get total count in parallel only if needed
    let total: number | undefined;
    if (includeTotal) {
      const countResult = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(DISTINCT "cveId") as count FROM "scan_vulnerability_findings" ${whereClause}`,
        ...params.slice(0, paramIndex - 1)
      );
      total = Number(countResult[0]?.count || 0);
    }

    // Fetch detailed findings and metadata in parallel
    const [vulnerabilityFindings, correlations] = await Promise.all([
      prisma.scanVulnerabilityFinding.findMany({
        where: {
          cveId: { in: finalCveIds }
        },
        select: {
          cveId: true,
          severity: true,
          cvssScore: true,
          description: true,
          title: true,
          packageName: true,
          fixedVersion: true,
          publishedDate: true,
          vulnerabilityUrl: true,
          source: true,
          scanId: true,
          scan: {
            select: {
              imageId: true,
              image: {
                select: {
                  name: true
                }
              }
            }
          }
        }
      }),
      prisma.scanFindingCorrelation.findMany({
        where: {
          findingType: 'vulnerability',
          correlationKey: { in: finalCveIds }
        },
        select: {
          correlationKey: true,
          sources: true,
          sourceCount: true,
          confidenceScore: true
        }
      })
    ]);

    // Get classifications for affected images
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

    // Build quick lookup maps
    const cveDataMap = new Map<string, {
      fixedVersions: Set<string>;
      references: Set<string>;
      affectedImages: Array<{
        imageName: string;
        imageId: string;
        isFalsePositive: boolean;
      }>;
      sources: Set<string>;
      publishedDate?: Date;
    }>();

    // Process findings efficiently
    for (const finding of vulnerabilityFindings) {
      const cveId = finding.cveId;

      if (!cveDataMap.has(cveId)) {
        cveDataMap.set(cveId, {
          fixedVersions: new Set(),
          references: new Set(),
          affectedImages: [],
          sources: new Set(),
          publishedDate: finding.publishedDate || undefined
        });
      }

      const cveData = cveDataMap.get(cveId)!;

      if (finding.fixedVersion) cveData.fixedVersions.add(finding.fixedVersion);
      if (finding.vulnerabilityUrl) cveData.references.add(finding.vulnerabilityUrl);
      cveData.sources.add(finding.source);

      // Limit affected images to reduce payload
      if (cveData.affectedImages.length < maxAffectedImages) {
        const imageClassifications = classificationMap.get(cveId);
        const isFalsePositive = imageClassifications?.get(finding.scan.imageId) || false;

        const imageExists = cveData.affectedImages.some(img => img.imageId === finding.scan.imageId);
        if (!imageExists) {
          cveData.affectedImages.push({
            imageName: finding.scan.image.name,
            imageId: finding.scan.imageId,
            isFalsePositive
          });
        }
      }
    }

    const correlationMap = new Map<string, any>();
    correlations.forEach(corr => {
      correlationMap.set(corr.correlationKey, corr);
    });

    // Build aggregation lookup map
    const aggregationMap = new Map<string, typeof cveAggregations[0]>();
    cveAggregations.forEach(agg => {
      aggregationMap.set(agg.cveId, agg);
    });

    // Convert to array (already sorted by the query)
    const vulnerabilities = finalCveIds.map((cveId) => {
      const cveData = cveDataMap.get(cveId);
      const aggregated = aggregationMap.get(cveId);
      const correlation = correlationMap.get(cveId);

      return {
        cveId: cveId,
        severity: aggregated?.severity || 'UNKNOWN',
        description: aggregated?.description || undefined,
        cvssScore: aggregated?.maxCvssScore || undefined,
        packageName: aggregated?.packageName || (cveData ? Array.from(cveData.fixedVersions)[0] : undefined),
        affectedImages: cveData?.affectedImages || [],
        totalAffectedImages: Number(aggregated?.scanCount || 0),
        falsePositiveImages: cveData?.affectedImages
          .filter(img => img.isFalsePositive)
          .map(img => img.imageName) || [],
        fixedVersion: cveData ? Array.from(cveData.fixedVersions)[0] : undefined,
        publishedDate: cveData?.publishedDate?.toISOString(),
        references: cveData ? Array.from(cveData.references) : [],
        sources: cveData ? Array.from(cveData.sources) : [],
        sourceCount: correlation?.sourceCount || (cveData?.sources.size || 0),
        confidenceScore: correlation?.confidenceScore
      };
    });

    return NextResponse.json({
      vulnerabilities,
      pagination: {
        total,
        limit,
        offset,
        hasMore: total !== undefined ? offset + limit < total : vulnerabilities.length >= limit
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