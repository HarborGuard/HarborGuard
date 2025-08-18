import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import type { TrivyReport, GrypeReport } from '@/types';

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
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');
    const search = searchParams.get('search') || '';
    const severity = searchParams.get('severity') || '';

    // Get all scans with their scanner reports and image information
    const scans = await prisma.scan.findMany({
      include: {
        image: {
          select: {
            id: true,
            name: true,
            tag: true,
          }
        }
      },
      where: {
        status: 'SUCCESS',
        OR: [
          { trivy: { not: null } },
          { grype: { not: null } }
        ]
      }
    });

    // Get all CVE classifications
    const allClassifications = await prisma.cveClassification.findMany({
      include: {
        image: {
          select: {
            id: true,
            name: true,
            tag: true,
          }
        }
      }
    });

    // Create a map of CVE -> Image classifications
    const classificationMap = new Map<string, Map<string, boolean>>();
    allClassifications.forEach(classification => {
      if (!classificationMap.has(classification.cveId)) {
        classificationMap.set(classification.cveId, new Map());
      }
      classificationMap.get(classification.cveId)?.set(
        classification.image.name,
        classification.isFalsePositive
      );
    });

    // Process vulnerabilities from scanner reports
    const vulnerabilityMap = new Map<string, VulnerabilityData>();

    for (const scan of scans) {
      const imageName = scan.image.name;
      const imageId = scan.image.id;
      
      // Process Trivy results
      if (scan.trivy) {
        const trivyReport = scan.trivy as TrivyReport;
        if (trivyReport.Results) {
          for (const result of trivyReport.Results) {
            if (result.Vulnerabilities) {
              for (const vuln of result.Vulnerabilities) {
                if (!vuln.VulnerabilityID) continue;

                const cveId = vuln.VulnerabilityID;
                const vulnSeverity = vuln.Severity?.toLowerCase() || 'unknown';
                
                // Skip if severity filter is applied and doesn't match
                if (severity && vulnSeverity !== severity) continue;
                
                // Skip if search filter is applied and doesn't match
                if (search && !cveId.toLowerCase().includes(search.toLowerCase()) && 
                    !(vuln.Title?.toLowerCase().includes(search.toLowerCase()))) continue;

                let vulnData = vulnerabilityMap.get(cveId);
                if (!vulnData) {
                  vulnData = {
                    cveId,
                    severity: vulnSeverity,
                    description: vuln.Title || vuln.Description,
                    cvssScore: vuln.CVSS?.nvd?.V3Score || vuln.CVSS?.redhat?.V3Score,
                    packageName: vuln.PkgName,
                    affectedImages: [],
                    totalAffectedImages: 0,
                    falsePositiveImages: [],
                    fixedVersion: vuln.FixedVersion,
                    publishedDate: vuln.PublishedDate,
                    references: vuln.References
                  };
                  vulnerabilityMap.set(cveId, vulnData);
                }

                // Check if this image already exists in the affected images
                const existingImage = vulnData.affectedImages.find(img => img.imageName === imageName);
                if (!existingImage) {
                  const isFalsePositive = classificationMap.get(cveId)?.get(imageName) === true;
                  
                  vulnData.affectedImages.push({
                    imageName,
                    imageId,
                    isFalsePositive
                  });

                  if (isFalsePositive) {
                    vulnData.falsePositiveImages.push(imageName);
                  }
                }
              }
            }
          }
        }
      }
      // Process Grype results if no Trivy data
      else if (scan.grype) {
        const grypeReport = scan.grype as GrypeReport;
        if (grypeReport.matches) {
          for (const match of grypeReport.matches) {
            if (!match.vulnerability.id) continue;

            const cveId = match.vulnerability.id;
            const vulnSeverity = match.vulnerability.severity?.toLowerCase() || 'unknown';
            
            // Apply filters
            if (severity && vulnSeverity !== severity) continue;
            if (search && !cveId.toLowerCase().includes(search.toLowerCase()) && 
                !(match.vulnerability.description?.toLowerCase().includes(search.toLowerCase()))) continue;

            let vulnData = vulnerabilityMap.get(cveId);
            if (!vulnData) {
              vulnData = {
                cveId,
                severity: vulnSeverity,
                description: match.vulnerability.description,
                cvssScore: match.vulnerability.cvss?.[0]?.metrics?.baseScore,
                packageName: match.artifact.name,
                affectedImages: [],
                totalAffectedImages: 0,
                falsePositiveImages: [],
                fixedVersion: match.vulnerability.fix?.versions?.[0],
                publishedDate: undefined,
                references: match.vulnerability.urls
              };
              vulnerabilityMap.set(cveId, vulnData);
            }

            // Check if this image already exists in the affected images
            const existingImage = vulnData.affectedImages.find(img => img.imageName === imageName);
            if (!existingImage) {
              const isFalsePositive = classificationMap.get(cveId)?.get(imageName) === true;
              
              vulnData.affectedImages.push({
                imageName,
                imageId,
                isFalsePositive
              });

              if (isFalsePositive) {
                vulnData.falsePositiveImages.push(imageName);
              }
            }
          }
        }
      }
    }

    // Convert to array and update total affected images count
    const vulnerabilities = Array.from(vulnerabilityMap.values()).map(vuln => ({
      ...vuln,
      totalAffectedImages: vuln.affectedImages.length
    }));

    // Sort by severity priority and CVE ID
    const severityPriority = { critical: 5, high: 4, medium: 3, low: 2, info: 1, unknown: 0 };
    vulnerabilities.sort((a, b) => {
      const priorityDiff = (severityPriority[b.severity as keyof typeof severityPriority] || 0) - 
                          (severityPriority[a.severity as keyof typeof severityPriority] || 0);
      if (priorityDiff !== 0) return priorityDiff;
      return a.cveId.localeCompare(b.cveId);
    });

    // Apply pagination
    const paginatedVulnerabilities = vulnerabilities.slice(offset, offset + limit);

    return NextResponse.json({
      vulnerabilities: paginatedVulnerabilities,
      pagination: {
        total: vulnerabilities.length,
        limit,
        offset,
        hasMore: offset + limit < vulnerabilities.length
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