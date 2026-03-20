import { prisma } from '@/lib/prisma';
import type { IScannerAdapter, NormalizedVulnerability, NormalizedPackage, NormalizedCompliance, NormalizedEfficiency } from '../types';
import { mapOsvSeverity, extractOsvScore } from '../severity-mappers';

export class OsvAdapter implements IScannerAdapter {
  readonly name = 'osv';

  async saveResults(metadataId: string, osvData: any): Promise<void> {
    const osvResult = await prisma.osvResults.upsert({
      where: { scanMetadataId: metadataId },
      create: {
        scanMetadataId: metadataId,
      },
      update: {
        scanMetadataId: metadataId,
      },
    });

    const vulnerabilities: any[] = [];

    if (osvData.results && osvData.results.length > 0) {
      for (const result of osvData.results) {
        if (result.packages) {
          for (const pkg of result.packages) {
            if (pkg.vulnerabilities) {
              for (const vuln of pkg.vulnerabilities) {
                vulnerabilities.push({
                  osvResultsId: osvResult.id,
                  osvId: vuln.id || 'UNKNOWN',
                  aliases: vuln.aliases || null,
                  packageName: pkg.package?.name || 'unknown',
                  packageEcosystem: pkg.package?.ecosystem || 'unknown',
                  packageVersion: pkg.package?.version || '',
                  packagePurl: pkg.package?.purl || null,
                  summary: vuln.summary || null,
                  details: vuln.details || null,
                  severity: vuln.severity || null,
                  fixed:
                    vuln.affected?.[0]?.ranges?.[0]?.events?.find((e: any) => e.fixed)?.fixed || null,
                  affected: vuln.affected || null,
                  published: vuln.published ? new Date(vuln.published) : null,
                  modified: vuln.modified ? new Date(vuln.modified) : null,
                  withdrawn: vuln.withdrawn ? new Date(vuln.withdrawn) : null,
                  references: vuln.references || null,
                  databaseSpecific: vuln.database_specific || null,
                });
              }
            }
          }
        }
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.osvVulnerability.deleteMany({ where: { osvResultsId: osvResult.id } });

      if (vulnerabilities.length > 0) {
        await tx.osvVulnerability.createMany({ data: vulnerabilities });
      }
    });
  }

  extractVulnerabilities(report: any): NormalizedVulnerability[] {
    const findings: NormalizedVulnerability[] = [];

    if (report?.results) {
      for (const result of report.results) {
        for (const pkg of result.packages || []) {
          for (const vuln of pkg.vulnerabilities || []) {
            findings.push({
              cveId: vuln.id,
              source: 'osv',
              severity: mapOsvSeverity(vuln.severity),
              cvssScore: extractOsvScore(vuln.severity) || undefined,
              title: vuln.summary || undefined,
              description: vuln.details || undefined,
              packageName: pkg.package.name,
              installedVersion: pkg.package.version || undefined,
              vulnerabilityUrl: vuln.references?.[0]?.url || undefined,
            });
          }
        }
      }
    }

    return findings;
  }

  extractPackages(_report: any): NormalizedPackage[] {
    // OSV does not produce package inventory findings
    return [];
  }

  extractCompliance(_report: any): NormalizedCompliance[] {
    // OSV does not produce compliance findings
    return [];
  }

  extractEfficiency(_report: any): NormalizedEfficiency[] {
    // OSV does not produce efficiency findings
    return [];
  }
}
