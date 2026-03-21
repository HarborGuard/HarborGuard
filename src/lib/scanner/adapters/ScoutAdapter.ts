import type { IScannerAdapter, NormalizedVulnerability, NormalizedPackage, NormalizedCompliance, NormalizedEfficiency } from '../types';
import { mapSeverity } from '../severity-mappers';

export class ScoutAdapter implements IScannerAdapter {
  readonly name = 'scout';

  async saveResults(_metadataId: string, _report: any): Promise<void> {
    // Scout results are stored as raw JSON in ScanMetadata
    // No dedicated Scout table — uses the generic JSONB storage
    // The raw data is already saved by the ScanMetadata upsert in DatabaseAdapter
  }

  extractVulnerabilities(report: any): NormalizedVulnerability[] {
    const findings: NormalizedVulnerability[] = [];

    // Docker Scout JSON format has vulnerabilities under various paths
    // Common format: { vulnerabilities: [{ cve_id, severity, package, ... }] }
    const vulns = report?.vulnerabilities || report?.cves || [];

    for (const vuln of vulns) {
      findings.push({
        cveId: vuln.cve_id || vuln.id || vuln.name || 'UNKNOWN',
        source: 'scout',
        severity: mapSeverity(vuln.severity),
        cvssScore: vuln.cvss_score || vuln.cvss?.score || null,
        title: vuln.title || vuln.description?.substring(0, 200) || '',
        description: vuln.description || '',
        packageName: vuln.package?.name || vuln.pkg_name || '',
        installedVersion: vuln.package?.version || vuln.installed_version || '',
        fixedVersion: vuln.fixed_version || vuln.fix?.versions?.[0] || '',
        vulnerabilityUrl: vuln.url || vuln.reference || '',
      });
    }

    return findings;
  }

  extractPackages(_report: any): NormalizedPackage[] {
    // Scout focuses on vulnerabilities, not SBOM — return empty
    return [];
  }

  extractCompliance(_report: any): NormalizedCompliance[] {
    return [];
  }

  extractEfficiency(_report: any): NormalizedEfficiency[] {
    return [];
  }
}
