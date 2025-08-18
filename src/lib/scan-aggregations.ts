// Utilities for aggregating and processing scan data from the database
// Converts raw scanner reports into UI-friendly data

import type { 
  Scan, 
  ScanWithImage, 
  TrivyReport, 
  GrypeReport, 
  DockleReport, 
  OSVReport,
  OSVPackage,
  SyftReport,
  VulnerabilityCount,
  ComplianceScore,
  CveClassification 
} from '@/types';

/**
 * Aggregate vulnerability data from scanner reports
 */
export function aggregateVulnerabilities(scan: Scan): VulnerabilityCount {
  const stored = scan.vulnerabilityCount as VulnerabilityCount | undefined;
  
  // Return stored aggregation if available
  if (stored) {
    return stored;
  }

  // Fallback: calculate from scanner reports
  const vulnCount: VulnerabilityCount = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };

  // Process Trivy results (preferred)
  const trivyReport = scan.scannerReports?.trivy as TrivyReport | undefined;
  if (trivyReport?.Results) {
    for (const result of trivyReport.Results) {
      if (result.Vulnerabilities) {
        for (const vuln of result.Vulnerabilities) {
          const severity = vuln.Severity?.toLowerCase();
          if (severity && severity in vulnCount) {
            vulnCount[severity as keyof VulnerabilityCount]++;
          }
        }
      }
    }
    return vulnCount;
  }

  // Fallback: Process Grype results
  const grypeReport = scan.scannerReports?.grype as GrypeReport | undefined;
  if (grypeReport?.matches) {
    for (const match of grypeReport.matches) {
      const severity = match.vulnerability.severity?.toLowerCase();
      if (severity && severity in vulnCount) {
        vulnCount[severity as keyof VulnerabilityCount]++;
      }
    }
  }

  return vulnCount;
}

/**
 * Calculate risk score from vulnerability counts
 */
export function calculateRiskScore(scan: Scan): number {
  // Use stored risk score if available
  if (scan.riskScore) {
    return scan.riskScore;
  }

  const vulnCount = aggregateVulnerabilities(scan);
  
  // Calculate weighted risk score (0-100)
  const riskScore = Math.min(100, Math.round(
    (vulnCount.critical * 25) +
    (vulnCount.high * 10) +
    (vulnCount.medium * 3) +
    (vulnCount.low * 1) +
    ((vulnCount.info || 0) * 0.1)
  ));

  return riskScore;
}

/**
 * Aggregate vulnerability data from scanner reports, excluding false positives
 */
export function aggregateVulnerabilitiesWithClassifications(
  scan: Scan, 
  classifications: CveClassification[]
): VulnerabilityCount {
  const stored = scan.vulnerabilityCount as VulnerabilityCount | undefined;
  
  // Create set of false positive CVE IDs for quick lookup
  const falsePositiveSet = new Set(
    classifications
      .filter(c => c.isFalsePositive)
      .map(c => c.cveId)
  );

  // If no false positives to filter, return stored or calculated vulnerabilities
  if (falsePositiveSet.size === 0) {
    return stored || aggregateVulnerabilities(scan);
  }

  // Calculate vulnerabilities excluding false positives
  const vulnCount: VulnerabilityCount = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };

  // Process Trivy results (preferred)
  const trivyReport = scan.scannerReports?.trivy as TrivyReport | undefined;
  if (trivyReport?.Results) {
    for (const result of trivyReport.Results) {
      if (result.Vulnerabilities) {
        for (const vuln of result.Vulnerabilities) {
          // Skip if this CVE is marked as false positive
          if (vuln.VulnerabilityID && falsePositiveSet.has(vuln.VulnerabilityID)) {
            continue;
          }
          
          const severity = vuln.Severity?.toLowerCase();
          if (severity && severity in vulnCount) {
            vulnCount[severity as keyof VulnerabilityCount]++;
          }
        }
      }
    }
    return vulnCount;
  }

  // Fallback: Process Grype results
  const grypeReport = scan.scannerReports?.grype as GrypeReport | undefined;
  if (grypeReport?.matches) {
    for (const match of grypeReport.matches) {
      // Skip if this CVE is marked as false positive
      if (match.vulnerability.id && falsePositiveSet.has(match.vulnerability.id)) {
        continue;
      }
      
      const severity = match.vulnerability.severity?.toLowerCase();
      if (severity && severity in vulnCount) {
        vulnCount[severity as keyof VulnerabilityCount]++;
      }
    }
  }

  return vulnCount;
}

/**
 * Calculate risk score excluding false positive CVEs
 */
export function calculateRiskScoreWithClassifications(
  scan: Scan, 
  classifications: CveClassification[]
): number {
  const vulnCount = aggregateVulnerabilitiesWithClassifications(scan, classifications);
  
  // Calculate weighted risk score (0-100)
  const riskScore = Math.min(100, Math.round(
    (vulnCount.critical * 25) +
    (vulnCount.high * 10) +
    (vulnCount.medium * 3) +
    (vulnCount.low * 1) +
    ((vulnCount.info || 0) * 0.1)
  ));

  return riskScore;
}

/**
 * Recalculate and update risk scores for all scans of an image
 * This should be called whenever CVE classifications change for an image
 */
export async function recalculateImageRiskScores(imageId: string): Promise<void> {
  const { prisma } = await import('@/lib/prisma');
  
  try {
    // Get all classifications for this image
    const classifications = await prisma.cveClassification.findMany({
      where: { imageId }
    });

    // Get all scans for this image with their scanner reports
    const scans = await prisma.scan.findMany({
      where: { imageId },
      include: {
        image: true
      }
    });

    // Recalculate risk score for each scan
    const updates = [];
    for (const scan of scans) {
      // Only recalculate if we have scanner reports to work with
      if (scan.trivy || scan.grype) {
        const newRiskScore = calculateRiskScoreWithClassifications(scan as any, classifications);
        
        // Only update if the score changed
        if (scan.riskScore !== newRiskScore) {
          updates.push(
            prisma.scan.update({
              where: { id: scan.id },
              data: { 
                riskScore: newRiskScore,
                updatedAt: new Date()
              }
            })
          );
        }
      }
    }

    // Execute all updates in parallel
    if (updates.length > 0) {
      await Promise.all(updates);
      console.log(`Updated risk scores for ${updates.length} scans of image ${imageId}`);
    }
  } catch (error) {
    console.error(`Failed to recalculate risk scores for image ${imageId}:`, error);
    throw error;
  }
}

/**
 * Extract compliance scores from scanner reports
 */
export function aggregateCompliance(scan: Scan): ComplianceScore {
  const stored = scan.complianceScore as ComplianceScore | undefined;
  
  // Return stored compliance if available
  if (stored) {
    return stored;
  }

  const compliance: ComplianceScore = {};

  // Process Dockle results
  const dockleReport = scan.scannerReports?.dockle as DockleReport | undefined;
  if (dockleReport?.summary) {
    const { fatal, warn, info, pass } = dockleReport.summary;
    const total = fatal + warn + info + pass;
    const score = total > 0 ? Math.round((pass / total) * 100) : 0;
    
    let grade: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' = 'F';
    if (score >= 90) grade = 'A';
    else if (score >= 80) grade = 'B';
    else if (score >= 70) grade = 'C';
    else if (score >= 60) grade = 'D';
    else if (score >= 50) grade = 'E';

    compliance.dockle = {
      score,
      grade,
      fatal,
      warn,
      info,
      pass,
    };
  }

  return compliance;
}

/**
 * Count misconfigurations from scanner reports
 */
export function countMisconfigurations(scan: Scan): number {
  const trivyReport = scan.scannerReports?.trivy as TrivyReport | undefined;
  
  if (trivyReport?.Results) {
    let count = 0;
    for (const result of trivyReport.Results) {
      if (result.Misconfigurations) {
        count += result.Misconfigurations.length;
      }
    }
    return count;
  }

  return 0;
}

/**
 * Count secrets from scanner reports
 */
export function countSecrets(scan: Scan): number {
  const trivyReport = scan.scannerReports?.trivy as TrivyReport | undefined;
  
  if (trivyReport?.Results) {
    let count = 0;
    for (const result of trivyReport.Results) {
      if (result.Secrets) {
        count += result.Secrets.length;
      }
    }
    return count;
  }

  return 0;
}

/**
 * Calculate scan duration
 */
export function calculateScanDuration(scan: Scan): string {
  if (!scan.finishedAt) {
    return 'In progress';
  }

  const start = new Date(scan.startedAt);
  const finish = new Date(scan.finishedAt);
  const durationMs = finish.getTime() - start.getTime();
  const durationMin = Math.round(durationMs / 60000);

  if (durationMin < 1) {
    return '< 1 min';
  } else if (durationMin < 60) {
    return `${durationMin} min`;
  } else {
    const hours = Math.floor(durationMin / 60);
    const minutes = durationMin % 60;
    return `${hours}h ${minutes}m`;
  }
}

/**
 * Calculate fixable vulnerabilities estimate
 */
export function calculateFixable(scan: Scan): { count: number; percent: number } {
  const vulnCount = aggregateVulnerabilities(scan);
  const total = vulnCount.critical + vulnCount.high + vulnCount.medium + vulnCount.low;
  
  if (total === 0) {
    return { count: 0, percent: 0 };
  }

  // Estimate based on vulnerability patterns (this could be improved with actual data)
  const criticalFixable = Math.round(vulnCount.critical * 0.7);
  const highFixable = Math.round(vulnCount.high * 0.6);
  const mediumFixable = Math.round(vulnCount.medium * 0.4);
  const lowFixable = Math.round(vulnCount.low * 0.3);
  
  const count = criticalFixable + highFixable + mediumFixable + lowFixable;
  const percent = Math.round((count / total) * 100);

  return { count, percent };
}

/**
 * Get highest CVSS score from vulnerabilities
 */
export function getHighestCVSS(scan: Scan): number {
  let highestScore = 0;

  const trivyReport = scan.scannerReports?.trivy as TrivyReport | undefined;
  if (trivyReport?.Results) {
    for (const result of trivyReport.Results) {
      if (result.Vulnerabilities) {
        for (const vuln of result.Vulnerabilities) {
          if (vuln.CVSS) {
            const score = vuln.CVSS.redhat?.V3Score || vuln.CVSS.nvd?.V3Score || 0;
            if (score > highestScore) {
              highestScore = score;
            }
          }
        }
      }
    }
  }

  return highestScore;
}

/**
 * Extract scanner versions used for the scan
 */
export function getScannerVersions(scan: Scan): Record<string, string> {
  const stored = scan.scannerVersions as Record<string, string> | undefined;
  
  if (stored) {
    return stored;
  }

  // Default versions if not stored
  return {
    trivy: 'unknown',
    grype: 'unknown', 
    syft: 'unknown',
    dockle: 'unknown',
  };
}

/**
 * Get OS information from scanner reports
 */
export function getOSInfo(scan: Scan): { family: string; name: string } | null {
  const trivyReport = scan.scannerReports?.trivy as TrivyReport | undefined;
  
  if (trivyReport?.Metadata?.OS) {
    return {
      family: trivyReport.Metadata.OS.Family,
      name: trivyReport.Metadata.OS.Name,
    };
  }

  return null;
}

/**
 * Calculate vulnerability changes between scans
 */
export function calculateVulnerabilityDelta(currentScan: Scan, previousScan?: Scan): {
  newCritical: number;
  newHigh: number;
  newMedium: number;
  newLow: number;
  resolvedTotal: number;
} {
  const current = aggregateVulnerabilities(currentScan);
  const previous = previousScan ? aggregateVulnerabilities(previousScan) : null;

  if (!previous) {
    return {
      newCritical: current.critical,
      newHigh: current.high,
      newMedium: current.medium,
      newLow: current.low,
      resolvedTotal: 0,
    };
  }

  const newCritical = Math.max(0, current.critical - previous.critical);
  const newHigh = Math.max(0, current.high - previous.high);
  const newMedium = Math.max(0, current.medium - previous.medium);
  const newLow = Math.max(0, current.low - previous.low);

  const resolvedCritical = Math.max(0, previous.critical - current.critical);
  const resolvedHigh = Math.max(0, previous.high - current.high);
  const resolvedMedium = Math.max(0, previous.medium - current.medium);
  const resolvedLow = Math.max(0, previous.low - current.low);

  const resolvedTotal = resolvedCritical + resolvedHigh + resolvedMedium + resolvedLow;

  return {
    newCritical,
    newHigh,
    newMedium,
    newLow,
    resolvedTotal,
  };
}

/**
 * Format scan data for historical table display
 */
export function formatScanForTable(scan: ScanWithImage, previousScan?: ScanWithImage) {
  const vulnerabilities = aggregateVulnerabilities(scan);
  const compliance = aggregateCompliance(scan);
  const riskScore = calculateRiskScore(scan);
  const fixable = calculateFixable(scan);
  const duration = calculateScanDuration(scan);
  const delta = calculateVulnerabilityDelta(scan, previousScan);
  const scannerVersions = getScannerVersions(scan);

  // Safely handle date conversion - could be Date object or ISO string
  const formatDate = (date: Date | string | null | undefined): string => {
    if (!date) return '';
    if (typeof date === 'string') return date;
    return date.toISOString();
  };

  return {
    id: scan.id,
    scanDate: formatDate(scan.finishedAt) || formatDate(scan.createdAt),
    version: scan.image.tag,
    riskScore,
    severities: {
      crit: vulnerabilities.critical,
      high: vulnerabilities.high,
      med: vulnerabilities.medium,
      low: vulnerabilities.low,
    },
    fixable,
    status: scan.status,
    scanDuration: duration,
    newVulns: delta.newCritical + delta.newHigh + delta.newMedium + delta.newLow,
    resolvedVulns: delta.resolvedTotal,
    misconfigs: countMisconfigurations(scan),
    secrets: countSecrets(scan),
    compliance: {
      dockle: compliance.dockle?.grade || 'N/A',
    },
    dbVersion: '2h', // Placeholder
    scanEngine: Object.entries(scannerVersions).map(([k, v]) => `${k}:${v}`).join(', '),
  };
}

/**
 * Aggregate unique vulnerabilities across all scans by CVE ID
 * This prevents duplicate counting when the same image is scanned multiple times
 */
export function aggregateUniqueVulnerabilities(scans: ScanWithImage[] | Scan[]): VulnerabilityCount {
  const uniqueCVEs = new Map<string, string>(); // CVE ID -> severity
  
  for (const scan of scans) {
    // Process Trivy results (preferred)
    const trivyReport = scan.scannerReports?.trivy as TrivyReport | undefined;
    if (trivyReport?.Results) {
      for (const result of trivyReport.Results) {
        if (result.Vulnerabilities) {
          for (const vuln of result.Vulnerabilities) {
            if (vuln.VulnerabilityID) {
              const severity = vuln.Severity?.toLowerCase();
              if (severity && ['critical', 'high', 'medium', 'low', 'info'].includes(severity)) {
                // Only add if we haven't seen this CVE before, or if this is a higher severity
                const existingSeverity = uniqueCVEs.get(vuln.VulnerabilityID);
                if (!existingSeverity || getSeverityPriority(severity) > getSeverityPriority(existingSeverity)) {
                  uniqueCVEs.set(vuln.VulnerabilityID, severity);
                }
              }
            }
          }
        }
      }
      continue; // Skip Grype if we have Trivy data
    }

    // Fallback: Process Grype results if no Trivy data
    const grypeReport = scan.scannerReports?.grype as GrypeReport | undefined;
    if (grypeReport?.matches) {
      for (const match of grypeReport.matches) {
        if (match.vulnerability.id) {
          const severity = match.vulnerability.severity?.toLowerCase();
          if (severity && ['critical', 'high', 'medium', 'low', 'info'].includes(severity)) {
            const existingSeverity = uniqueCVEs.get(match.vulnerability.id);
            if (!existingSeverity || getSeverityPriority(severity) > getSeverityPriority(existingSeverity)) {
              uniqueCVEs.set(match.vulnerability.id, severity);
            }
          }
        }
      }
    }
  }

  // Count unique CVEs by severity
  const vulnCount: VulnerabilityCount = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };

  for (const [_cveId, severity] of uniqueCVEs.entries()) {
    if (severity in vulnCount) {
      vulnCount[severity as keyof VulnerabilityCount]++;
    }
  }

  return vulnCount;
}

/**
 * Get severity priority for comparison (higher number = higher priority)
 */
function getSeverityPriority(severity: string): number {
  const priorities: Record<string, number> = {
    'info': 1,
    'low': 2,
    'medium': 3,
    'high': 4,
    'critical': 5,
  };
  return priorities[severity] || 0;
}

/**
 * Calculate dashboard statistics from scan data with unique CVE aggregation
 */
export function calculateDashboardStats(scans: ScanWithImage[]) {
  if (scans.length === 0) {
    return {
      totalScans: 0,
      vulnerabilities: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        total: 0,
      },
      avgRiskScore: 0,
      blockedScans: 0,
      completeScans: 0,
      completionRate: 0,
    };
  }

  // Use unique CVE aggregation instead of simple summation
  const uniqueVulns = aggregateUniqueVulnerabilities(scans);
  
  let totalRiskScore = 0;
  let completedScans = 0;
  let blockedScans = 0;

  for (const scan of scans) {    
    totalRiskScore += calculateRiskScore(scan);
    
    if (scan.status === 'SUCCESS') {
      completedScans++;
    }
    
    // You could add policy evaluation logic here for blocked scans
    // For now, estimate based on high risk scores
    if (calculateRiskScore(scan) > 75) {
      blockedScans++;
    }
  }

  const totalVulns = uniqueVulns.critical + uniqueVulns.high + uniqueVulns.medium + uniqueVulns.low;
  const avgRiskScore = Math.round(totalRiskScore / scans.length);
  const completionRate = Math.round((completedScans / scans.length) * 100);

  return {
    totalScans: scans.length,
    vulnerabilities: {
      critical: uniqueVulns.critical,
      high: uniqueVulns.high,
      medium: uniqueVulns.medium,
      low: uniqueVulns.low,
      total: totalVulns,
    },
    avgRiskScore,
    blockedScans,
    completeScans: completedScans,
    completionRate,
  };
}

/**
 * Extract OSV vulnerabilities from scan
 */
export function getOSVVulnerabilities(scan: Scan): OSVPackage[] {
  const osvReport = scan.scannerReports?.osv as OSVReport | undefined;
  if (!osvReport?.results) return [];

  return osvReport.results.flatMap(result => result.packages || []);
}

/**
 * Count OSV vulnerabilities by severity
 */
export function countOSVVulnerabilities(scan: Scan): VulnerabilityCount {
  const packages = getOSVVulnerabilities(scan);
  const vulnCount: VulnerabilityCount = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };

  for (const pkg of packages) {
    for (const vuln of pkg.vulnerabilities) {
      if (vuln.severity) {
        for (const sev of vuln.severity) {
          if (sev.type === 'CVSS_V3' && sev.score) {
            // Extract CVSS score and map to severity
            const cvssMatch = sev.score.match(/CVSS:3\.\d\/AV:\w+\/AC:\w+\/PR:\w+\/UI:\w+\/S:\w+\/C:\w+\/I:\w+\/A:\w+/);
            if (cvssMatch) {
              // Parse CVSS score from the vector (basic parsing)
              const score = parseFloat(sev.score.split('/')[0].replace('CVSS:3.1', '').replace('CVSS:3.0', '')) || 0;
              if (score >= 9.0) vulnCount.critical++;
              else if (score >= 7.0) vulnCount.high++;
              else if (score >= 4.0) vulnCount.medium++;
              else if (score > 0) vulnCount.low++;
              else if (vulnCount.info !== undefined) vulnCount.info++;
            }
          }
        }
      }
    }
  }

  return vulnCount;
}

/**
 * Get unique ecosystems from OSV scan
 */
export function getOSVEcosystems(scan: Scan): string[] {
  const packages = getOSVVulnerabilities(scan);
  const ecosystems = new Set<string>();
  
  for (const pkg of packages) {
    if (pkg.package.ecosystem) {
      ecosystems.add(pkg.package.ecosystem);
    }
  }
  
  return Array.from(ecosystems).sort();
}

/**
 * Get OSV package statistics
 */
export function getOSVPackageStats(scan: Scan): {
  totalPackages: number;
  vulnerablePackages: number;
  ecosystemCounts: Record<string, number>;
  totalVulnerabilities: number;
} {
  const packages = getOSVVulnerabilities(scan);
  const ecosystemCounts: Record<string, number> = {};
  let vulnerablePackages = 0;
  let totalVulnerabilities = 0;

  for (const pkg of packages) {
    // Count by ecosystem
    const ecosystem = pkg.package.ecosystem;
    ecosystemCounts[ecosystem] = (ecosystemCounts[ecosystem] || 0) + 1;
    
    // Count vulnerable packages
    if (pkg.vulnerabilities.length > 0) {
      vulnerablePackages++;
      totalVulnerabilities += pkg.vulnerabilities.length;
    }
  }

  return {
    totalPackages: packages.length,
    vulnerablePackages,
    ecosystemCounts,
    totalVulnerabilities,
  };
}

/**
 * Get Syft packages from scan reports
 */
export function getSyftPackages(scan: Scan) {
  const syftReport = scan.scannerReports?.syft as SyftReport | undefined;
  return syftReport?.artifacts || [];
}

/**
 * Get Syft package statistics
 */
export function getSyftPackageStats(scan: Scan) {
  const artifacts = getSyftPackages(scan);
  const typeCount: Record<string, number> = {};
  const languageCount: Record<string, number> = {};
  let packagesWithLicenses = 0;

  for (const artifact of artifacts) {
    // Count by type
    if (artifact.type) {
      typeCount[artifact.type] = (typeCount[artifact.type] || 0) + 1;
    }

    // Count by language
    if (artifact.language) {
      languageCount[artifact.language] = (languageCount[artifact.language] || 0) + 1;
    }

    // Count packages with licenses
    if (artifact.licenses && artifact.licenses.length > 0) {
      packagesWithLicenses++;
    }
  }

  return {
    totalPackages: artifacts.length,
    packagesWithLicenses,
    typeCount,
    languageCount,
  };
}

/**
 * Aggregate unique vulnerabilities from legacy scan format (includes scannerReports)
 * Used by components that work with transformed legacy scan data
 */
export function aggregateUniqueVulnerabilitiesFromLegacyScans(scans: any[]): VulnerabilityCount {
  const uniqueCVEs = new Map<string, string>(); // CVE ID -> severity
  
  for (const scan of scans) {
    // Process Trivy results (preferred)
    const trivyReport = scan.scannerReports?.trivy as TrivyReport | undefined;
    if (trivyReport?.Results) {
      for (const result of trivyReport.Results) {
        if (result.Vulnerabilities) {
          for (const vuln of result.Vulnerabilities) {
            if (vuln.VulnerabilityID) {
              const severity = vuln.Severity?.toLowerCase();
              if (severity && ['critical', 'high', 'medium', 'low', 'info'].includes(severity)) {
                // Only add if we haven't seen this CVE before, or if this is a higher severity
                const existingSeverity = uniqueCVEs.get(vuln.VulnerabilityID);
                if (!existingSeverity || getSeverityPriority(severity) > getSeverityPriority(existingSeverity)) {
                  uniqueCVEs.set(vuln.VulnerabilityID, severity);
                }
              }
            }
          }
        }
      }
      continue; // Skip Grype if we have Trivy data
    }

    // Fallback: Process Grype results if no Trivy data
    const grypeReport = scan.scannerReports?.grype as GrypeReport | undefined;
    if (grypeReport?.matches) {
      for (const match of grypeReport.matches) {
        if (match.vulnerability.id) {
          const severity = match.vulnerability.severity?.toLowerCase();
          if (severity && ['critical', 'high', 'medium', 'low', 'info'].includes(severity)) {
            const existingSeverity = uniqueCVEs.get(match.vulnerability.id);
            if (!existingSeverity || getSeverityPriority(severity) > getSeverityPriority(existingSeverity)) {
              uniqueCVEs.set(match.vulnerability.id, severity);
            }
          }
        }
      }
    }
  }

  // Count unique CVEs by severity
  const vulnCount: VulnerabilityCount = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };

  for (const [_cveId, severity] of uniqueCVEs.entries()) {
    if (severity in vulnCount) {
      vulnCount[severity as keyof VulnerabilityCount]++;
    }
  }

  return vulnCount;
}