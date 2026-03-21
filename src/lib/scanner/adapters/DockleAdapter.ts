import { prisma } from '@/lib/prisma';
import type { IScannerAdapter, NormalizedVulnerability, NormalizedPackage, NormalizedCompliance, NormalizedEfficiency } from '../types';
import { mapDockleCategory, mapDockleSeverity } from '../severity-mappers';

export class DockleAdapter implements IScannerAdapter {
  readonly name = 'dockle';

  async saveResults(metadataId: string, dockleData: any): Promise<void> {
    const dockleResult = await prisma.dockleResults.upsert({
      where: { scanMetadataId: metadataId },
      create: {
        scanMetadataId: metadataId,
        summary: dockleData.summary || null,
      },
      update: {
        summary: dockleData.summary || null,
      },
    });

    await prisma.$transaction(async (tx) => {
      await tx.dockleViolation.deleteMany({ where: { dockleResultsId: dockleResult.id } });

      if (dockleData.details && dockleData.details.length > 0) {
        const violations = dockleData.details.map((detail: any) => ({
          dockleResultsId: dockleResult.id,
          code: detail.code || '',
          title: detail.title || '',
          level: detail.level || 'INFO',
          alerts: detail.alerts || null,
        }));

        await tx.dockleViolation.createMany({ data: violations });
      }
    });
  }

  extractVulnerabilities(_report: any): NormalizedVulnerability[] {
    // Dockle does not produce vulnerability findings
    return [];
  }

  extractPackages(_report: any): NormalizedPackage[] {
    // Dockle does not produce package findings
    return [];
  }

  extractCompliance(report: any): NormalizedCompliance[] {
    const findings: any[] = [];

    if (report?.details) {
      for (const detail of report.details) {
        for (const alert of detail.alerts || []) {
          findings.push({
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

    return findings;
  }

  extractEfficiency(_report: any): NormalizedEfficiency[] {
    // Dockle does not produce efficiency findings
    return [];
  }
}
