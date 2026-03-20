/**
 * Finding normalization and aggregation logic.
 * Normalizes vulnerability, package, compliance, and efficiency findings
 * from multiple scanners into unified tables, and computes aggregated
 * risk/compliance scores.
 */

import { prisma } from '@/lib/prisma';
import type { ScanReports, AggregatedData } from './types';
import type { VulnerabilityCount } from '@/types';
import {
  getHighestSeverity,
} from './severity-mappers';
import { ScannerAdapterRegistry } from './adapters';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Populate all normalized finding tables from scan reports.
 */
export async function populateNormalizedFindings(scanId: string, reports: ScanReports): Promise<void> {
  try {
    await populateVulnerabilityFindings(scanId, reports);
    await populatePackageFindings(scanId, reports);
    await populateComplianceFindings(scanId, reports);
    await populateEfficiencyFindings(scanId, reports);
    await createFindingCorrelations(scanId);
  } catch (error) {
    console.error('Error populating normalized findings:', error);
    // Continue even if normalization fails - we still have the raw JSON data
  }
}

/**
 * Calculate aggregated vulnerability counts, risk score, and compliance
 * score, then persist them on the scan and metadata records.
 */
export async function calculateAggregatedData(
  scanId: string,
  reports: ScanReports,
  metadataId: string | undefined,
  updateScanRecord: (scanId: string, updates: any) => Promise<void>,
): Promise<void> {
  const aggregates: AggregatedData = {};
  const vulnCount: VulnerabilityCount = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  let totalCvssScore = 0;
  let cvssCount = 0;

  // Aggregate vulnerabilities from Trivy
  if (reports.trivy?.Results) {
    for (const result of reports.trivy.Results) {
      if (result.Vulnerabilities) {
        for (const vuln of result.Vulnerabilities) {
          const severity = vuln.Severity?.toLowerCase();
          if (severity && vulnCount.hasOwnProperty(severity)) {
            vulnCount[severity as keyof VulnerabilityCount]++;
          }

          if (vuln.CVSS?.redhat?.V3Score || vuln.CVSS?.nvd?.V3Score) {
            const score = vuln.CVSS.redhat?.V3Score || vuln.CVSS.nvd?.V3Score;
            totalCvssScore += score;
            cvssCount++;
          }
        }
      }
    }
  }

  // Aggregate vulnerabilities from Grype
  if (reports.grype?.matches) {
    for (const match of reports.grype.matches) {
      const severity = match.vulnerability?.severity?.toLowerCase();
      if (severity && vulnCount.hasOwnProperty(severity)) {
        vulnCount[severity as keyof VulnerabilityCount]++;
      }

      if (match.vulnerability?.cvss) {
        for (const cvss of match.vulnerability.cvss) {
          if (cvss.metrics?.baseScore) {
            totalCvssScore += cvss.metrics.baseScore;
            cvssCount++;
            break; // Use first available score
          }
        }
      }
    }
  }

  // Aggregate vulnerabilities from OSV
  if (reports.osv?.results) {
    for (const result of reports.osv.results) {
      if (result.packages) {
        for (const pkg of result.packages) {
          if (pkg.vulnerabilities) {
            for (const vuln of pkg.vulnerabilities) {
              if (vuln.severity) {
                for (const sev of vuln.severity) {
                  if (sev.type === 'CVSS_V3' && sev.score) {
                    const score = parseFloat(sev.score);
                    totalCvssScore += score;
                    cvssCount++;

                    if (score >= 9.0) vulnCount.critical++;
                    else if (score >= 7.0) vulnCount.high++;
                    else if (score >= 4.0) vulnCount.medium++;
                    else if (score >= 0.1) vulnCount.low++;
                    else vulnCount.info++;
                    break;
                  }
                }
              } else {
                vulnCount.info++;
              }
            }
          }
        }
      }
    }
  }

  // Only set vulnerability count if we found any vulnerabilities
  if (vulnCount.critical > 0 || vulnCount.high > 0 || vulnCount.medium > 0 ||
      vulnCount.low > 0 || vulnCount.info > 0) {
    aggregates.vulnerabilityCount = vulnCount;

    const avgCvss = cvssCount > 0 ? totalCvssScore / cvssCount : 0;
    aggregates.riskScore = Math.min(100, Math.round(
      (vulnCount.critical * 25) +
      (vulnCount.high * 10) +
      (vulnCount.medium * 3) +
      (vulnCount.low * 1) +
      (avgCvss * 5)
    ));
  }

  if (reports.dockle?.summary) {
    const { fatal, warn, info, pass } = reports.dockle.summary;
    const total = fatal + warn + info + pass;
    const complianceScore = total > 0 ? Math.round((pass / total) * 100) : 0;

    aggregates.complianceScore = {
      dockle: {
        score: complianceScore,
        grade: complianceScore >= 90 ? 'A' : complianceScore >= 80 ? 'B' : complianceScore >= 70 ? 'C' : 'D',
        fatal,
        warn,
        info,
        pass,
      }
    };
  }

  if (Object.keys(aggregates).length > 0) {
    // Update scan record with risk score
    const scanUpdateData: any = {};
    if (aggregates.riskScore !== undefined) {
      scanUpdateData.riskScore = aggregates.riskScore;
    }

    if (Object.keys(scanUpdateData).length > 0) {
      await updateScanRecord(scanId, scanUpdateData);
    }

    // Update ScanMetadata with aggregated data
    const metadataUpdateData: any = {};

    if (aggregates.vulnerabilityCount) {
      metadataUpdateData.vulnerabilityCritical = aggregates.vulnerabilityCount.critical || 0;
      metadataUpdateData.vulnerabilityHigh = aggregates.vulnerabilityCount.high || 0;
      metadataUpdateData.vulnerabilityMedium = aggregates.vulnerabilityCount.medium || 0;
      metadataUpdateData.vulnerabilityLow = aggregates.vulnerabilityCount.low || 0;
      metadataUpdateData.vulnerabilityInfo = aggregates.vulnerabilityCount.info || 0;
    }

    if (aggregates.riskScore !== undefined) {
      metadataUpdateData.aggregatedRiskScore = aggregates.riskScore;
    }

    if (aggregates.complianceScore?.dockle) {
      const dockle = aggregates.complianceScore.dockle;
      metadataUpdateData.complianceScore = dockle.score || null;
      metadataUpdateData.complianceGrade = dockle.grade || null;
      metadataUpdateData.complianceFatal = dockle.fatal || null;
      metadataUpdateData.complianceWarn = dockle.warn || null;
      metadataUpdateData.complianceInfo = dockle.info || null;
      metadataUpdateData.compliancePass = dockle.pass || null;
    }

    // Only update metadata if we have a metadataId
    if (metadataId) {
      await prisma.scanMetadata.update({
        where: { id: metadataId },
        data: metadataUpdateData
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function populateVulnerabilityFindings(scanId: string, reports: ScanReports): Promise<void> {
  const allFindings: any[] = [];

  for (const [name, report] of Object.entries(reports)) {
    if (!report) continue;
    const adapter = ScannerAdapterRegistry.get(name);
    if (adapter) {
      const findings = adapter.extractVulnerabilities(report);
      allFindings.push(...findings);
    }
  }

  if (allFindings.length > 0) {
    await prisma.scanVulnerabilityFinding.createMany({
      data: allFindings.map(f => ({ scanId, ...f }))
    });
  }
}

async function populatePackageFindings(scanId: string, reports: ScanReports): Promise<void> {
  const allFindings: any[] = [];

  for (const [name, report] of Object.entries(reports)) {
    if (!report) continue;
    const adapter = ScannerAdapterRegistry.get(name);
    if (adapter) {
      const findings = adapter.extractPackages(report);
      allFindings.push(...findings);
    }
  }

  if (allFindings.length > 0) {
    await prisma.scanPackageFinding.createMany({
      data: allFindings.map(f => ({ scanId, ...f }))
    });
  }
}

async function populateComplianceFindings(scanId: string, reports: ScanReports): Promise<void> {
  const allFindings: any[] = [];

  for (const [name, report] of Object.entries(reports)) {
    if (!report) continue;
    const adapter = ScannerAdapterRegistry.get(name);
    if (adapter) {
      const findings = adapter.extractCompliance(report);
      allFindings.push(...findings);
    }
  }

  if (allFindings.length > 0) {
    await prisma.scanComplianceFinding.createMany({
      data: allFindings.map(f => ({ scanId, ...f }))
    });
  }
}

async function populateEfficiencyFindings(scanId: string, reports: ScanReports): Promise<void> {
  const allFindings: any[] = [];

  for (const [name, report] of Object.entries(reports)) {
    if (!report) continue;
    const adapter = ScannerAdapterRegistry.get(name);
    if (adapter) {
      const findings = adapter.extractEfficiency(report);
      allFindings.push(...findings);
    }
  }

  if (allFindings.length > 0) {
    await prisma.scanEfficiencyFinding.createMany({
      data: allFindings.map(f => ({ scanId, ...f }))
    });
  }
}

async function createFindingCorrelations(scanId: string): Promise<void> {
  const vulnFindings = await prisma.scanVulnerabilityFinding.findMany({
    where: { scanId },
    select: { cveId: true, source: true, severity: true }
  });

  const correlations: Record<string, { sources: Set<string>; severities: string[] }> = {};
  for (const finding of vulnFindings) {
    if (!correlations[finding.cveId]) {
      correlations[finding.cveId] = {
        sources: new Set(),
        severities: []
      };
    }
    correlations[finding.cveId].sources.add(finding.source);
    correlations[finding.cveId].severities.push(finding.severity);
  }

  for (const [cveId, data] of Object.entries(correlations)) {
    const sources = Array.from(data.sources);

    await prisma.scanFindingCorrelation.upsert({
      where: {
        scanId_findingType_correlationKey: {
          scanId,
          findingType: 'vulnerability',
          correlationKey: cveId
        }
      },
      create: {
        scanId,
        findingType: 'vulnerability',
        correlationKey: cveId,
        sources,
        sourceCount: sources.length,
        confidenceScore: sources.length / 3,
        severity: getHighestSeverity(data.severities) as any
      },
      update: {
        sources,
        sourceCount: sources.length,
        confidenceScore: sources.length / 3,
        severity: getHighestSeverity(data.severities) as any
      }
    });
  }
}
