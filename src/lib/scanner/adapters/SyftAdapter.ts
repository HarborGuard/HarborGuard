import { prisma } from '@/lib/prisma';
import type { IScannerAdapter, NormalizedVulnerability, NormalizedPackage, NormalizedCompliance, NormalizedEfficiency } from '../types';

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

export class SyftAdapter implements IScannerAdapter {
  readonly name = 'syft';

  async saveResults(metadataId: string, syftData: any): Promise<void> {
    const syftResult = await prisma.syftResults.upsert({
      where: { scanMetadataId: metadataId },
      create: {
        scanMetadataId: metadataId,
        schemaVersion: syftData.schema?.version || null,
        bomFormat: syftData.descriptor?.name || null,
        specVersion: syftData.specVersion || null,
        serialNumber: syftData.serialNumber || null,
        packagesCount: syftData.artifacts?.length || 0,
        filesAnalyzed: syftData.source?.target?.imageSize || 0,
        source: syftData.source || null,
        distro: syftData.distro || null,
      },
      update: {
        schemaVersion: syftData.schema?.version || null,
        bomFormat: syftData.descriptor?.name || null,
        specVersion: syftData.specVersion || null,
        serialNumber: syftData.serialNumber || null,
        packagesCount: syftData.artifacts?.length || 0,
        filesAnalyzed: syftData.source?.target?.imageSize || 0,
        source: syftData.source || null,
        distro: syftData.distro || null,
      },
    });

    await prisma.$transaction(async (tx) => {
      await tx.syftPackage.deleteMany({ where: { syftResultsId: syftResult.id } });

      if (syftData.artifacts && syftData.artifacts.length > 0) {
        const packages = syftData.artifacts.map((artifact: any) => {
          let cpeString: string | null = null;
          if (artifact.cpes && artifact.cpes.length > 0) {
            const firstCpe = artifact.cpes[0];
            if (typeof firstCpe === 'string') {
              cpeString = firstCpe;
            } else if (typeof firstCpe === 'object' && firstCpe.cpe) {
              cpeString = firstCpe.cpe;
            } else if (typeof firstCpe === 'object' && firstCpe.value) {
              cpeString = firstCpe.value;
            }
          }

          return {
            syftResultsId: syftResult.id,
            packageId: artifact.id || '',
            name: artifact.name || 'unknown',
            version: artifact.version || '',
            type: artifact.type || 'unknown',
            foundBy: artifact.foundBy || null,
            purl: artifact.purl || null,
            cpe: cpeString,
            language: artifact.language || null,
            licenses: artifact.licenses || null,
            size: artifact.metadata?.installedSize ? BigInt(artifact.metadata.installedSize) : null,
            locations: artifact.locations || null,
            layerId: artifact.locations?.[0]?.layerID || null,
            metadata: artifact.metadata || null,
          };
        });

        await tx.syftPackage.createMany({ data: packages });
      }
    });
  }

  extractVulnerabilities(_report: any): NormalizedVulnerability[] {
    // Syft does not produce vulnerability findings
    return [];
  }

  extractPackages(report: any): NormalizedPackage[] {
    const findings: any[] = [];

    if (report?.artifacts) {
      for (const artifact of report.artifacts) {
        findings.push({
          source: 'syft',
          packageName: artifact.name,
          version: artifact.version || null,
          type: artifact.type || 'unknown',
          purl: artifact.purl || null,
          license: formatLicense(artifact.licenses) || null,
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

    return findings;
  }

  extractCompliance(_report: any): NormalizedCompliance[] {
    // Syft does not produce compliance findings
    return [];
  }

  extractEfficiency(_report: any): NormalizedEfficiency[] {
    // Syft does not produce efficiency findings
    return [];
  }
}
