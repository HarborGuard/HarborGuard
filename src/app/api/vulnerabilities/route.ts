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

    // Get all scans with their scan results
    const scans = await prisma.scan.findMany({
      where: {
        status: 'SUCCESS'
      },
      include: {
        image: true,
        metadata: true
      }
    });

    // Extract all vulnerabilities from scan metadata
    const cveMap = new Map<string, {
      cveId: string;
      severity: string;
      description: string;
      cvssScore?: number;
      packageNames: Set<string>;
      fixedVersions: Set<string>;
      publishedDate?: string;
      references: Set<string>;
      affectedImages: Map<string, {
        imageName: string;
        imageId: string;
        isFalsePositive: boolean;
      }>;
    }>();

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
        'critical': 5,
        'high': 4,
        'medium': 3,
        'low': 2,
        'negligible': 1,
        'info': 1,
        'unknown': 0
      };
      return priority[severity.toLowerCase()] || 0;
    }

    // Process each scan for vulnerabilities
    for (const scan of scans) {
      // Skip if no metadata
      if (!scan.metadata) continue;
      
      // Access scan results from metadata
      const scanResults = {
        trivy: scan.metadata.trivyResults as any,
        grype: scan.metadata.grypeResults as any
      };
      
      // Process Trivy results
      const trivyResults = scanResults?.trivy;
      if (trivyResults?.Results) {
        for (const result of trivyResults.Results) {
          if (result.Vulnerabilities) {
            for (const vuln of result.Vulnerabilities) {
              const cveId = vuln.VulnerabilityID;
              if (!cveId) continue;

              // Check if this CVE is marked as false positive for this image
              const imageClassifications = classificationMap.get(cveId);
              const isFalsePositive = imageClassifications?.get(scan.imageId) || false;

              if (!cveMap.has(cveId)) {
                cveMap.set(cveId, {
                  cveId,
                  severity: vuln.Severity?.toLowerCase() || 'unknown',
                  description: vuln.Description || vuln.Title || '',
                  cvssScore: vuln.CVSS?.nvd?.V3Score || vuln.CVSS?.redhat?.V3Score,
                  packageNames: new Set(),
                  fixedVersions: new Set(),
                  publishedDate: vuln.PublishedDate,
                  references: new Set(),
                  affectedImages: new Map()
                });
              } else {
                // Update to highest severity if this one is higher
                const existing = cveMap.get(cveId)!;
                const newSeverity = vuln.Severity?.toLowerCase() || 'unknown';
                if (getSeverityPriority(newSeverity) > getSeverityPriority(existing.severity)) {
                  existing.severity = newSeverity;
                }
                // Update CVSS if higher
                const newCvss = vuln.CVSS?.nvd?.V3Score || vuln.CVSS?.redhat?.V3Score;
                if (newCvss && (!existing.cvssScore || newCvss > existing.cvssScore)) {
                  existing.cvssScore = newCvss;
                }
                // Update description if empty
                if (!existing.description && (vuln.Description || vuln.Title)) {
                  existing.description = vuln.Description || vuln.Title || '';
                }
              }

              const cveData = cveMap.get(cveId)!;

              // Add package information
              if (vuln.PkgName) {
                cveData.packageNames.add(vuln.PkgName);
              }

              // Add fixed version information
              if (vuln.FixedVersion) {
                cveData.fixedVersions.add(vuln.FixedVersion);
              }

              // Add references
              if (vuln.References) {
                vuln.References.forEach((ref: string) => cveData.references.add(ref));
              }

              // Add affected image (using imageId as key to avoid duplicates)
              cveData.affectedImages.set(scan.imageId, {
                imageName: scan.image.name,
                imageId: scan.imageId,
                isFalsePositive
              });
            }
          }
        }
      }
      
      // Process Grype results
      const grypeResults = scanResults?.grype;
      if (grypeResults?.matches) {
        for (const match of grypeResults.matches) {
          const vuln = match.vulnerability;
          if (!vuln) continue;
          
          const cveId = vuln.id;
          if (!cveId) continue;

          // Check if this CVE is marked as false positive for this image
          const imageClassifications = classificationMap.get(cveId);
          const isFalsePositive = imageClassifications?.get(scan.imageId) || false;

          if (!cveMap.has(cveId)) {
            cveMap.set(cveId, {
              cveId,
              severity: vuln.severity?.toLowerCase() || 'unknown',
              description: vuln.description || '',
              cvssScore: vuln.cvss?.[0]?.metrics?.baseScore,
              packageNames: new Set(),
              fixedVersions: new Set(),
              publishedDate: vuln.publishedDate,
              references: new Set(),
              affectedImages: new Map()
            });
          } else {
            // Update to highest severity if this one is higher
            const existing = cveMap.get(cveId)!;
            const newSeverity = vuln.severity?.toLowerCase() || 'unknown';
            if (getSeverityPriority(newSeverity) > getSeverityPriority(existing.severity)) {
              existing.severity = newSeverity;
            }
          }

          const cveData = cveMap.get(cveId)!;

          // Add package information from artifact
          if (match.artifact?.name) {
            cveData.packageNames.add(match.artifact.name);
          }

          // Add fixed version information
          if (vuln.fix?.versions && vuln.fix.versions.length > 0) {
            vuln.fix.versions.forEach((v: string) => cveData.fixedVersions.add(v));
          }

          // Add references from URLs
          if (vuln.urls) {
            vuln.urls.forEach((url: string) => cveData.references.add(url));
          }

          // Add affected image (using imageId as key to avoid duplicates)
          cveData.affectedImages.set(scan.imageId, {
            imageName: scan.image.name,
            imageId: scan.imageId,
            isFalsePositive
          });
        }
      }
    }

    // Convert to array and apply filters
    let vulnerabilities = Array.from(cveMap.values()).map(cve => ({
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
      publishedDate: cve.publishedDate,
      references: Array.from(cve.references)
    }));

    // Apply severity filter
    if (severity) {
      vulnerabilities = vulnerabilities.filter(v => 
        v.severity.toLowerCase() === severity.toLowerCase()
      );
    }

    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase();
      vulnerabilities = vulnerabilities.filter(v =>
        v.cveId.toLowerCase().includes(searchLower) ||
        v.description.toLowerCase().includes(searchLower) ||
        v.packageName?.toLowerCase().includes(searchLower)
      );
    }

    // Sort by severity (critical > high > medium > low > unknown)
    const severityPriority: { [key: string]: number } = {
      'critical': 5,
      'high': 4,
      'medium': 3,
      'low': 2,
      'info': 1,
      'unknown': 0
    };

    vulnerabilities.sort((a, b) => {
      const aPriority = severityPriority[a.severity] || 0;
      const bPriority = severityPriority[b.severity] || 0;
      return bPriority - aPriority; // Descending order
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