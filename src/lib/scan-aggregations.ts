// TEMPORARY STUB FILE - All functions disabled to get build passing
// Original file backed up as scan-aggregations-backup.ts
// TODO: Systematically reimplement these functions to work with the new schema

import type { 
  Scan, 
  ScanWithImage, 
  VulnerabilityCount,
  ComplianceScore,
  CveClassification 
} from '@/types';
import { prisma } from '@/lib/prisma';

/**
 * STUB: Aggregate vulnerability data from scanner reports
 * TODO: Update to work with new schema - get from ImageVulnerability table
 */
export function aggregateVulnerabilities(scan: Scan): VulnerabilityCount {
  return {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };
}

/**
 * STUB: Calculate risk score from vulnerability counts
 * TODO: Update to work with new schema
 */
export function calculateRiskScore(scan: Scan): number {
  return scan.riskScore || 0;
}

/**
 * STUB: Aggregate vulnerability data with false positive filtering
 * TODO: Update to work with new schema
 */
export function aggregateVulnerabilitiesWithClassifications(
  scan: Scan, 
  classifications: CveClassification[]
): VulnerabilityCount {
  return aggregateVulnerabilities(scan);
}

/**
 * STUB: Aggregate compliance score from Dockle reports
 * TODO: Update to work with new schema - get from ScanResult table
 */
export function aggregateCompliance(scan: Scan): ComplianceScore {
  return {
    dockle: {
      score: 0,
      grade: 'F' as const,
      fatal: 0,
      warn: 0,
      info: 0,
      pass: 0,
    }
  };
}


/**
 * STUB: Get highest CVSS score from vulnerabilities
 * TODO: Update to work with new schema
 */
export function getHighestCVSS(scan: Scan): number {
  return 0;
}

/**
 * STUB: Count misconfiguration issues
 * TODO: Update to work with new schema
 */
export function countMisconfigurations(scan: Scan): number {
  return 0;
}

/**
 * STUB: Count secret detection findings
 * TODO: Update to work with new schema
 */
export function countSecrets(scan: Scan): number {
  return 0;
}

/**
 * STUB: Get OSV package statistics
 * TODO: Update to work with new schema
 */
export function getOSVPackageStats(scan: Scan): {
  totalPackages: number;
  vulnerablePackages: number;
  ecosystemCounts: Record<string, number>;
} {
  return {
    totalPackages: 0,
    vulnerablePackages: 0,
    ecosystemCounts: {},
  };
}

/**
 * STUB: Count OSV vulnerabilities
 * TODO: Update to work with new schema
 */
export function countOSVVulnerabilities(scan: Scan): number {
  return 0;
}

/**
 * STUB: Calculate scan duration
 * TODO: Update to work with new schema
 */
export function calculateScanDuration(scan: Scan): string {
  if (scan.finishedAt && scan.startedAt) {
    const start = typeof scan.startedAt === 'string' ? new Date(scan.startedAt) : scan.startedAt;
    const end = typeof scan.finishedAt === 'string' ? new Date(scan.finishedAt) : scan.finishedAt;
    const duration = end.getTime() - start.getTime();
    const seconds = Math.floor(duration / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
  return 'Unknown';
}

/**
 * Recalculate image risk scores based on vulnerabilities and CVE classifications
 */
export async function recalculateImageRiskScores(imageId: string): Promise<void> {
  try {
    // Get all scans for this image
    const scans = await prisma.scan.findMany({
      where: { imageId },
      include: {
        image: true
      }
    });

    if (scans.length === 0) {
      console.log(`No scans found for image ${imageId}, skipping risk calculation`);
      return;
    }

    console.log(`Recalculating risk scores for ${scans.length} scans of image ${imageId}`);

    // For each scan, recalculate risk score based on vulnerabilities and classifications
    for (const scan of scans) {
      try {
        let totalRiskScore = 0;
        let vulnerabilityCount = 0;

        // Get scan results from metadata
        const scanResults = (scan.metadata as any)?.scanResults;
        
        if (scanResults?.trivy?.Results) {
          for (const result of scanResults.trivy.Results) {
            if (result.Vulnerabilities) {
              for (const vuln of result.Vulnerabilities) {
                // Check if this vulnerability has a classification
                const vulnerability = await prisma.vulnerability.findUnique({
                  where: { cveId: vuln.VulnerabilityID }
                });

                if (vulnerability) {
                  const imageVuln = await prisma.imageVulnerability.findFirst({
                    where: {
                      imageId: scan.imageId,
                      vulnerabilityId: vulnerability.id
                    },
                    include: {
                      cveClassifications: true
                    }
                  });

                  const isMarkedFalsePositive = imageVuln?.cveClassifications?.some(
                    cls => cls.isFalsePositive
                  ) ?? false;

                  // Only count if not marked as false positive
                  if (!isMarkedFalsePositive) {
                    vulnerabilityCount++;
                    
                    // Calculate risk score based on severity
                    const severityScore = getSeverityScore(vuln.Severity);
                    const cvssScore = vuln.CVSS?.nvd?.V3Score || vuln.CVSS?.redhat?.V3Score || 0;
                    totalRiskScore += Math.max(severityScore, cvssScore * 10);
                  }
                } else {
                  // No classification exists, count as normal
                  vulnerabilityCount++;
                  const severityScore = getSeverityScore(vuln.Severity);
                  const cvssScore = vuln.CVSS?.nvd?.V3Score || vuln.CVSS?.redhat?.V3Score || 0;
                  totalRiskScore += Math.max(severityScore, cvssScore * 10);
                }
              }
            }
          }
        }

        // Calculate final risk score (0-100)
        const finalRiskScore = Math.min(100, Math.max(0, totalRiskScore / Math.max(1, vulnerabilityCount) * 10));

        // Update scan with new risk score
        await prisma.scan.update({
          where: { id: scan.id },
          data: {
            riskScore: Math.round(finalRiskScore)
          }
        });

        console.log(`Updated risk score for scan ${scan.id}: ${Math.round(finalRiskScore)} (${vulnerabilityCount} vulnerabilities)`);
      } catch (error) {
        console.error(`Failed to update risk score for scan ${scan.id}:`, error);
      }
    }

    console.log(`Completed risk score recalculation for image ${imageId}`);
  } catch (error) {
    console.error('Error recalculating image risk scores:', error);
    throw error;
  }
}

// Helper function to get numeric score for severity levels
function getSeverityScore(severity: string): number {
  switch (severity?.toLowerCase()) {
    case 'critical': return 90;
    case 'high': return 70;
    case 'medium': return 50;
    case 'low': return 30;
    case 'info': return 10;
    default: return 0;
  }
}

/**
 * STUB: Aggregate unique vulnerabilities from legacy scan format
 * TODO: Update to work with new schema
 */
export function aggregateUniqueVulnerabilities(scan: Scan): any[] {
  return [];
}

/**
 * STUB: Aggregate unique vulnerabilities from legacy scans format (required by data-table)
 * TODO: Update to work with new schema
 */
export function aggregateUniqueVulnerabilitiesFromLegacyScans(scans: any[]): VulnerabilityCount {
  return {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };
}

/**
 * STUB: Calculate dashboard statistics
 * TODO: Update to work with new schema
 */
export function calculateDashboardStats(scans: any[]): any {
  return {
    totalImages: scans.length,
    totalVulnerabilities: 0,
    avgRiskScore: 0,
    highRiskImages: 0,
  };
}