import { prisma } from '@/lib/prisma';
import type { IScannerAdapter, NormalizedVulnerability, NormalizedPackage, NormalizedCompliance, NormalizedEfficiency } from '../types';
import { mapSeverity } from '../severity-mappers';

export class GrypeAdapter implements IScannerAdapter {
  readonly name = 'grype';

  async saveResults(metadataId: string, grypeData: any): Promise<void> {
    const grypeResult = await prisma.grypeResults.upsert({
      where: { scanMetadataId: metadataId },
      create: {
        scanMetadataId: metadataId,
        matchesCount: grypeData.matches?.length || 0,
        dbStatus: grypeData.db || null,
      },
      update: {
        matchesCount: grypeData.matches?.length || 0,
        dbStatus: grypeData.db || null,
      },
    });

    await prisma.$transaction(async (tx) => {
      await tx.grypeVulnerability.deleteMany({ where: { grypeResultsId: grypeResult.id } });

      if (grypeData.matches && grypeData.matches.length > 0) {
        const vulnerabilities = grypeData.matches.map((match: any) => ({
          grypeResultsId: grypeResult.id,
          vulnerabilityId: match.vulnerability?.id || 'UNKNOWN',
          severity: match.vulnerability?.severity || 'INFO',
          namespace: match.vulnerability?.namespace || null,
          packageName: match.artifact?.name || 'unknown',
          packageVersion: match.artifact?.version || '',
          packageType: match.artifact?.type || 'unknown',
          packagePath: match.artifact?.locations?.[0]?.path || null,
          packageLanguage: match.artifact?.language || null,
          fixState: match.vulnerability?.fix?.state || null,
          fixVersions: match.vulnerability?.fix?.versions || null,
          cvssV2Score:
            match.vulnerability?.cvss?.[0]?.version === '2.0'
              ? match.vulnerability.cvss[0].metrics?.baseScore
              : null,
          cvssV2Vector:
            match.vulnerability?.cvss?.[0]?.version === '2.0' ? match.vulnerability.cvss[0].vector : null,
          cvssV3Score:
            match.vulnerability?.cvss?.find((c: any) => c.version?.startsWith('3'))?.metrics?.baseScore || null,
          cvssV3Vector:
            match.vulnerability?.cvss?.find((c: any) => c.version?.startsWith('3'))?.vector || null,
          urls: match.vulnerability?.urls || null,
          description: match.vulnerability?.description || null,
        }));

        await tx.grypeVulnerability.createMany({ data: vulnerabilities });
      }
    });
  }

  extractVulnerabilities(report: any): NormalizedVulnerability[] {
    const findings: NormalizedVulnerability[] = [];

    if (report?.matches) {
      for (const match of report.matches) {
        const vuln = match.vulnerability;
        findings.push({
          cveId: vuln.id,
          source: 'grype',
          severity: mapSeverity(vuln.severity),
          cvssScore: vuln.cvss?.[0]?.metrics?.baseScore || undefined,
          description: vuln.description || undefined,
          packageName: match.artifact.name,
          installedVersion: match.artifact.version || undefined,
          fixedVersion: vuln.fix?.versions?.[0] || undefined,
          vulnerabilityUrl: vuln.urls?.[0] || undefined,
        });
      }
    }

    return findings;
  }

  extractPackages(_report: any): NormalizedPackage[] {
    // Grype does not produce package inventory findings
    return [];
  }

  extractCompliance(_report: any): NormalizedCompliance[] {
    // Grype does not produce compliance findings
    return [];
  }

  extractEfficiency(_report: any): NormalizedEfficiency[] {
    // Grype does not produce efficiency findings
    return [];
  }
}
