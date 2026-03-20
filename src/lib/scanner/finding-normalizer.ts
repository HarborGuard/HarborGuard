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
  mapSeverity,
  mapOsvSeverity,
  extractOsvScore,
  mapDockleCategory,
  mapDockleSeverity,
  getHighestSeverity,
} from './severity-mappers';

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
  const findings: any[] = [];

  // Process Trivy results
  if (reports.trivy?.Results) {
    for (const result of reports.trivy.Results) {
      if (result.Vulnerabilities) {
        for (const vuln of result.Vulnerabilities) {
          findings.push({
            scanId,
            source: 'trivy',
            cveId: vuln.VulnerabilityID || vuln.PkgID,
            packageName: vuln.PkgName || vuln.PkgID,
            installedVersion: vuln.InstalledVersion || null,
            fixedVersion: vuln.FixedVersion || null,
            severity: mapSeverity(vuln.Severity),
            cvssScore: vuln.CVSS?.nvd?.V3Score || vuln.CVSS?.redhat?.V3Score || null,
            dataSource: vuln.DataSource?.Name || null,
            vulnerabilityUrl: vuln.PrimaryURL || null,
            title: vuln.Title || null,
            description: vuln.Description || null,
            publishedDate: vuln.PublishedDate ? new Date(vuln.PublishedDate) : null,
            lastModified: vuln.LastModifiedDate ? new Date(vuln.LastModifiedDate) : null,
            filePath: result.Target || null,
            packageType: result.Type || null,
            rawFinding: vuln
          });
        }
      }
    }
  }

  // Process Grype results
  if (reports.grype?.matches) {
    for (const match of reports.grype.matches) {
      const vuln = match.vulnerability;
      findings.push({
        scanId,
        source: 'grype',
        cveId: vuln.id,
        packageName: match.artifact.name,
        installedVersion: match.artifact.version || null,
        fixedVersion: vuln.fix?.versions?.[0] || null,
        severity: mapSeverity(vuln.severity),
        cvssScore: vuln.cvss?.[0]?.metrics?.baseScore || null,
        dataSource: vuln.dataSource || null,
        vulnerabilityUrl: vuln.urls?.[0] || null,
        title: null,
        description: vuln.description || null,
        filePath: match.artifact.locations?.[0]?.path || null,
        layerId: match.artifact.locations?.[0]?.layerID || null,
        packageType: match.artifact.type || null,
        rawFinding: match
      });
    }
  }

  // Process OSV results
  if (reports.osv?.results) {
    for (const result of reports.osv.results) {
      for (const pkg of result.packages || []) {
        for (const vuln of pkg.vulnerabilities || []) {
          findings.push({
            scanId,
            source: 'osv',
            cveId: vuln.id,
            packageName: pkg.package.name,
            installedVersion: pkg.package.version || null,
            fixedVersion: null,
            severity: mapOsvSeverity(vuln.severity),
            cvssScore: extractOsvScore(vuln.severity),
            dataSource: vuln.database_specific?.source || 'osv',
            vulnerabilityUrl: vuln.references?.[0]?.url || null,
            title: vuln.summary || null,
            description: vuln.details || null,
            publishedDate: vuln.published ? new Date(vuln.published) : null,
            lastModified: vuln.modified ? new Date(vuln.modified) : null,
            filePath: result.source?.path || null,
            packageType: pkg.package.ecosystem || null,
            rawFinding: vuln
          });
        }
      }
    }
  }

  if (findings.length > 0) {
    await prisma.scanVulnerabilityFinding.createMany({ data: findings });
  }
}

/**
 * Format a license value that may be a string, array, or object.
 */
function formatLicense(license: any): string | null {
  if (!license) return null;
  if (typeof license === 'string') return license;
  if (Array.isArray(license)) {
    const formatted = license.map(l => formatLicense(l)).filter(Boolean);
    if (formatted.length > 0) {
      return formatted.join(', ');
    }
    return null;
  }
  if (typeof license === 'object') {
    if (license.value) return license.value;
    if (license.spdxExpression) return license.spdxExpression;
    if (license.name) return license.name;
    if (license.license) return license.license;
    if (license.expression) return license.expression;
    const values = Object.values(license);
    const firstString = values.find(v => typeof v === 'string' && v !== 'declared');
    if (firstString) return firstString as string;
  }
  return null;
}

async function populatePackageFindings(scanId: string, reports: ScanReports): Promise<void> {
  const findings: any[] = [];

  // Process Syft results
  if (reports.syft?.artifacts) {
    for (const artifact of reports.syft.artifacts) {
      const formattedLicense = formatLicense(artifact.licenses);

      findings.push({
        scanId,
        source: 'syft',
        packageName: artifact.name,
        version: artifact.version || null,
        type: artifact.type || 'unknown',
        purl: artifact.purl || null,
        license: formattedLicense || null,
        vendor: artifact.vendor || null,
        publisher: artifact.publisher || null,
        ecosystem: artifact.language || null,
        language: artifact.language || null,
        filePath: artifact.locations?.[0]?.path || null,
        layerId: artifact.locations?.[0]?.layerID || null,
        metadata: artifact.metadata || null,
        dependencies: artifact.upstreams || null
      });
    }
  }

  // Extract packages from Trivy SBOM data
  if (reports.trivy?.Results) {
    for (const result of reports.trivy.Results) {
      if (result.Packages) {
        for (const pkg of result.Packages) {
          findings.push({
            scanId,
            source: 'trivy',
            packageName: pkg.Name,
            version: pkg.Version || null,
            type: result.Type || 'unknown',
            purl: null,
            license: formatLicense(pkg.License) || null,
            vendor: null,
            publisher: null,
            ecosystem: result.Type || null,
            language: null,
            filePath: result.Target || null,
            layerId: null,
            metadata: pkg
          });
        }
      }
    }
  }

  if (findings.length > 0) {
    await prisma.scanPackageFinding.createMany({ data: findings });
  }
}

async function populateComplianceFindings(scanId: string, reports: ScanReports): Promise<void> {
  const findings: any[] = [];

  // Process Dockle results
  if (reports.dockle?.details) {
    for (const detail of reports.dockle.details) {
      for (const alert of detail.alerts || []) {
        findings.push({
          scanId,
          source: 'dockle',
          ruleId: detail.code,
          ruleName: detail.title,
          category: mapDockleCategory(detail.level),
          severity: mapDockleSeverity(detail.level),
          message: alert,
          description: detail.details || null,
          remediation: null,
          filePath: null,
          lineNumber: null,
          code: null,
          rawFinding: detail
        });
      }
    }
  }

  if (findings.length > 0) {
    await prisma.scanComplianceFinding.createMany({ data: findings });
  }
}

async function populateEfficiencyFindings(scanId: string, reports: ScanReports): Promise<void> {
  const findings: any[] = [];

  // Process Dive results
  if (reports.dive?.layer) {
    for (const layer of reports.dive.layer) {
      const layerSizeBytes = Number(layer.sizeBytes || 0);
      if (layerSizeBytes > 50 * 1024 * 1024) { // > 50MB
        findings.push({
          scanId,
          source: 'dive',
          findingType: 'large_layer',
          severity: layerSizeBytes > 100 * 1024 * 1024 ? 'warning' : 'info',
          layerId: layer.id,
          layerIndex: layer.index,
          layerCommand: layer.command || null,
          sizeBytes: BigInt(layerSizeBytes),
          wastedBytes: null,
          efficiencyScore: null,
          description: `Large layer detected: ${(layerSizeBytes / 1024 / 1024).toFixed(2)}MB`,
          filePaths: null,
          rawFinding: layer
        });
      }
    }
  }

  if (findings.length > 0) {
    await prisma.scanEfficiencyFinding.createMany({ data: findings });
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
        severity: getHighestSeverity(data.severities)
      },
      update: {
        sources,
        sourceCount: sources.length,
        confidenceScore: sources.length / 3,
        severity: getHighestSeverity(data.severities)
      }
    });
  }
}
