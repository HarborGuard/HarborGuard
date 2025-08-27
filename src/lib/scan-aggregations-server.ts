/**
 * Server-side scan aggregation functions that require Prisma access
 * This file should only be imported in server-side code (API routes, server actions, etc.)
 */

import { prisma } from '@/lib/prisma';

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