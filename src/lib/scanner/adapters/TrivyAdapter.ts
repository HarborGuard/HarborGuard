import { prisma } from '@/lib/prisma';
import type { IScannerAdapter, NormalizedVulnerability, NormalizedPackage, NormalizedCompliance, NormalizedEfficiency } from '../types';
import { mapSeverity } from '../severity-mappers';

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

export class TrivyAdapter implements IScannerAdapter {
  readonly name = 'trivy';

  async saveResults(metadataId: string, trivyData: any): Promise<void> {
    const trivyResult = await prisma.trivyResults.upsert({
      where: { scanMetadataId: metadataId },
      create: {
        scanMetadataId: metadataId,
        schemaVersion: trivyData.SchemaVersion || null,
        artifactName: trivyData.ArtifactName || null,
        artifactType: trivyData.ArtifactType || null,
      },
      update: {
        schemaVersion: trivyData.SchemaVersion || null,
        artifactName: trivyData.ArtifactName || null,
        artifactType: trivyData.ArtifactType || null,
      },
    });

    await prisma.$transaction(async (tx) => {
      await tx.trivyVulnerability.deleteMany({ where: { trivyResultsId: trivyResult.id } });
      await tx.trivyMisconfiguration.deleteMany({ where: { trivyResultsId: trivyResult.id } });
      await tx.trivySecret.deleteMany({ where: { trivyResultsId: trivyResult.id } });

      if (trivyData.Results && trivyData.Results.length > 0) {
        for (const result of trivyData.Results) {
          if (result.Vulnerabilities && result.Vulnerabilities.length > 0) {
            const vulnerabilities = result.Vulnerabilities.map((vuln: any) => ({
              trivyResultsId: trivyResult.id,
              targetName: result.Target || '',
              targetClass: result.Class || null,
              targetType: result.Type || null,
              vulnerabilityId: vuln.VulnerabilityID || 'UNKNOWN',
              pkgId: vuln.PkgID || null,
              pkgName: vuln.PkgName || 'unknown',
              pkgPath: vuln.PkgPath || null,
              installedVersion: vuln.InstalledVersion || null,
              fixedVersion: vuln.FixedVersion || null,
              status: vuln.Status || null,
              severity: vuln.Severity || 'INFO',
              severitySource: vuln.SeveritySource || null,
              primaryUrl: vuln.PrimaryURL || null,
              cvssScore: vuln.CVSS?.nvd?.V2Score || null,
              cvssVector: vuln.CVSS?.nvd?.V2Vector || null,
              cvssScoreV3: vuln.CVSS?.nvd?.V3Score || vuln.CVSS?.redhat?.V3Score || null,
              cvssVectorV3: vuln.CVSS?.nvd?.V3Vector || vuln.CVSS?.redhat?.V3Vector || null,
              title: vuln.Title || null,
              description: vuln.Description || null,
              publishedDate: vuln.PublishedDate ? new Date(vuln.PublishedDate) : null,
              lastModifiedDate: vuln.LastModifiedDate ? new Date(vuln.LastModifiedDate) : null,
              references: vuln.References || null,
            }));

            await tx.trivyVulnerability.createMany({ data: vulnerabilities });
          }

          if (result.Misconfigurations && result.Misconfigurations.length > 0) {
            const misconfigs = result.Misconfigurations.map((misconf: any) => ({
              trivyResultsId: trivyResult.id,
              targetName: result.Target || '',
              targetClass: result.Class || null,
              targetType: result.Type || null,
              checkId: misconf.ID || '',
              avdId: misconf.AVDID || null,
              title: misconf.Title || '',
              description: misconf.Description || '',
              message: misconf.Message || '',
              namespace: misconf.Namespace || null,
              query: misconf.Query || null,
              severity: misconf.Severity || 'INFO',
              resolution: misconf.Resolution || null,
              status: misconf.Status || 'FAIL',
              startLine: misconf.CauseMetadata?.StartLine || null,
              endLine: misconf.CauseMetadata?.EndLine || null,
              code: misconf.CauseMetadata?.Code || null,
              primaryUrl: misconf.PrimaryURL || null,
              references: misconf.References || null,
            }));

            await tx.trivyMisconfiguration.createMany({ data: misconfigs });
          }

          if (result.Secrets && result.Secrets.length > 0) {
            const secrets = result.Secrets.map((secret: any) => ({
              trivyResultsId: trivyResult.id,
              targetName: result.Target || '',
              ruleId: secret.RuleID || '',
              category: secret.Category || '',
              severity: secret.Severity || 'INFO',
              title: secret.Title || '',
              startLine: secret.StartLine || 0,
              endLine: secret.EndLine || 0,
              code: secret.Code || null,
              match: secret.Match || null,
              layer:
                typeof secret.Layer === 'object' && secret.Layer
                  ? secret.Layer.DiffID || secret.Layer.Digest || JSON.stringify(secret.Layer)
                  : secret.Layer || null,
            }));

            await tx.trivySecret.createMany({ data: secrets });
          }
        }
      }
    });
  }

  extractVulnerabilities(report: any): NormalizedVulnerability[] {
    const findings: NormalizedVulnerability[] = [];

    if (report?.Results) {
      for (const result of report.Results) {
        if (result.Vulnerabilities) {
          for (const vuln of result.Vulnerabilities) {
            findings.push({
              cveId: vuln.VulnerabilityID || vuln.PkgID,
              source: 'trivy',
              severity: mapSeverity(vuln.Severity),
              cvssScore: vuln.CVSS?.nvd?.V3Score || vuln.CVSS?.redhat?.V3Score || undefined,
              title: vuln.Title || undefined,
              description: vuln.Description || undefined,
              packageName: vuln.PkgName || vuln.PkgID || undefined,
              installedVersion: vuln.InstalledVersion || undefined,
              fixedVersion: vuln.FixedVersion || undefined,
              vulnerabilityUrl: vuln.PrimaryURL || undefined,
              targetName: result.Target || undefined,
            });
          }
        }
      }
    }

    return findings;
  }

  extractPackages(report: any): NormalizedPackage[] {
    const findings: NormalizedPackage[] = [];

    if (report?.Results) {
      for (const result of report.Results) {
        if (result.Packages) {
          for (const pkg of result.Packages) {
            findings.push({
              name: pkg.Name,
              version: pkg.Version || '',
              type: result.Type || 'unknown',
              source: 'trivy',
              license: formatLicense(pkg.License) || undefined,
            });
          }
        }
      }
    }

    return findings;
  }

  extractCompliance(_report: any): NormalizedCompliance[] {
    // Trivy does not produce compliance findings in the current setup
    return [];
  }

  extractEfficiency(_report: any): NormalizedEfficiency[] {
    // Trivy does not produce efficiency findings
    return [];
  }
}
