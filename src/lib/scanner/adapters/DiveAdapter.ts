import { prisma } from '@/lib/prisma';
import type { IScannerAdapter, NormalizedVulnerability, NormalizedPackage, NormalizedCompliance, NormalizedEfficiency } from '../types';

export class DiveAdapter implements IScannerAdapter {
  readonly name = 'dive';

  async saveResults(metadataId: string, diveData: any): Promise<void> {
    const efficiencyScore = diveData.image?.efficiencyScore || 0;
    const sizeBytes = BigInt(diveData.image?.sizeBytes || 0);
    const wastedBytes = BigInt(diveData.image?.inefficientBytes || 0);
    const wastedPercent = sizeBytes > 0 ? (Number(wastedBytes) / Number(sizeBytes)) * 100 : 0;

    const diveResult = await prisma.diveResults.upsert({
      where: { scanMetadataId: metadataId },
      create: {
        scanMetadataId: metadataId,
        efficiencyScore,
        sizeBytes,
        wastedBytes,
        wastedPercent,
        inefficientFiles: diveData.image?.inefficientFiles || null,
        duplicateFiles: diveData.image?.duplicateFiles || null,
      },
      update: {
        efficiencyScore,
        sizeBytes,
        wastedBytes,
        wastedPercent,
        inefficientFiles: diveData.image?.inefficientFiles || null,
        duplicateFiles: diveData.image?.duplicateFiles || null,
      },
    });

    await prisma.$transaction(async (tx) => {
      await tx.diveLayer.deleteMany({ where: { diveResultsId: diveResult.id } });

      if (diveData.layer && diveData.layer.length > 0) {
        const layers = diveData.layer.map((layer: any, index: number) => ({
          diveResultsId: diveResult.id,
          layerId: layer.id || '',
          layerIndex: index,
          digest: layer.digest || '',
          sizeBytes: BigInt(layer.sizeBytes || 0),
          command: layer.command || null,
          addedFiles: layer.addedFiles || 0,
          modifiedFiles: layer.modifiedFiles || 0,
          removedFiles: layer.removedFiles || 0,
          wastedBytes: BigInt(layer.wastedBytes || 0),
          fileDetails: layer.fileDetails || null,
        }));

        await tx.diveLayer.createMany({ data: layers });
      }
    });
  }

  extractVulnerabilities(_report: any): NormalizedVulnerability[] {
    // Dive does not produce vulnerability findings
    return [];
  }

  extractPackages(_report: any): NormalizedPackage[] {
    // Dive does not produce package findings
    return [];
  }

  extractCompliance(_report: any): NormalizedCompliance[] {
    // Dive does not produce compliance findings
    return [];
  }

  extractEfficiency(report: any): NormalizedEfficiency[] {
    const findings: any[] = [];

    if (report?.layer) {
      for (const layer of report.layer) {
        const layerSizeBytes = Number(layer.sizeBytes || 0);
        if (layerSizeBytes > 50 * 1024 * 1024) { // > 50MB
          findings.push({
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

    return findings;
  }
}
