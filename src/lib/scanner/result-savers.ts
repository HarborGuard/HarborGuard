/**
 * Scanner result saving functions.
 * Each function persists results from a specific scanner (Grype, Trivy,
 * Dive, Syft, Dockle, OSV) into their dedicated Prisma tables.
 */

import { prisma } from '@/lib/prisma';
import type { ScanReports } from './types';

/**
 * Create or update ScanMetadata record, storing raw JSONB data for downloads
 * and Docker image metadata fields.
 */
export async function createOrUpdateScanMetadata(scanId: string, reports: ScanReports): Promise<string> {
  const metadata = reports.metadata || {};

  const scanMetadataData = {
    dockerId: metadata.Id || null,
    dockerOs: metadata.Os || metadata.os || null,
    dockerArchitecture: metadata.Architecture || metadata.architecture || null,
    dockerSize: metadata.Size ? BigInt(metadata.Size) : null,
    dockerAuthor: metadata.Author || null,
    dockerCreated: metadata.Created ? new Date(metadata.Created) : null,
    dockerVersion: metadata.DockerVersion || null,
    dockerParent: metadata.Parent || null,
    dockerComment: metadata.Comment || null,
    dockerDigest: metadata.Digest || null,
    dockerConfig: metadata.Config || null,
    dockerRootFS: metadata.RootFS || null,
    dockerGraphDriver: metadata.GraphDriver || null,
    dockerRepoTags: metadata.RepoTags || null,
    dockerRepoDigests: metadata.RepoDigests || null,
    dockerMetadata: metadata.Metadata || null,
    dockerLabels: metadata.Labels || metadata.Config?.Labels || null,
    dockerEnv: metadata.Env || metadata.Config?.Env || null,

    // Scan Results
    trivyResults: reports.trivy || null,
    grypeResults: reports.grype || null,
    syftResults: reports.syft || null,
    dockleResults: reports.dockle || null,
    osvResults: reports.osv || null,
    diveResults: reports.dive || null,

    // Scanner versions
    scannerVersions: metadata.scannerVersions || null,
  };

  const metadataId = await prisma.$transaction(async (tx) => {
    const scan = await tx.scan.findUnique({
      where: { id: scanId },
      select: { metadataId: true },
    });

    if (scan?.metadataId) {
      await tx.scanMetadata.update({
        where: { id: scan.metadataId },
        data: scanMetadataData,
      });
      return scan.metadataId;
    } else {
      const newMetadata = await tx.scanMetadata.create({
        data: scanMetadataData,
      });

      await tx.scan.update({
        where: { id: scanId },
        data: { metadataId: newMetadata.id },
      });

      return newMetadata.id;
    }
  });

  return metadataId;
}

/**
 * Dispatch scan reports to their individual scanner result tables.
 */
export async function saveScannerResultTables(metadataId: string, reports: ScanReports): Promise<void> {
  try {
    if (reports.grype) {
      await saveGrypeResults(metadataId, reports.grype);
    }

    if (reports.trivy) {
      await saveTrivyResults(metadataId, reports.trivy);
    }

    if (reports.dive) {
      await saveDiveResults(metadataId, reports.dive);
    }

    if (reports.syft) {
      await saveSyftResults(metadataId, reports.syft);
    }

    if (reports.dockle) {
      await saveDockleResults(metadataId, reports.dockle);
    }

    if (reports.osv) {
      await saveOsvResults(metadataId, reports.osv);
    }
  } catch (error) {
    console.error('Error saving to scanner result tables:', error);
    // Continue even if table save fails - we still have the JSONB data
  }
}

async function saveGrypeResults(metadataId: string, grypeData: any): Promise<void> {
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

    await prisma.grypeVulnerability.createMany({ data: vulnerabilities });
  }
}

async function saveTrivyResults(metadataId: string, trivyData: any): Promise<void> {
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

  if (trivyData.Results && trivyData.Results.length > 0) {
    for (const result of trivyData.Results) {
      // Save vulnerabilities
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

        await prisma.trivyVulnerability.createMany({ data: vulnerabilities });
      }

      // Save misconfigurations
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

        await prisma.trivyMisconfiguration.createMany({ data: misconfigs });
      }

      // Save secrets
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
          // Handle Layer being an object with DiffID
          layer:
            typeof secret.Layer === 'object' && secret.Layer
              ? secret.Layer.DiffID || secret.Layer.Digest || JSON.stringify(secret.Layer)
              : secret.Layer || null,
        }));

        await prisma.trivySecret.createMany({ data: secrets });
      }
    }
  }
}

async function saveDiveResults(metadataId: string, diveData: any): Promise<void> {
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

  // Delete existing layers and insert new ones atomically
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

async function saveSyftResults(metadataId: string, syftData: any): Promise<void> {
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

  // Delete existing packages and insert new ones atomically
  await prisma.$transaction(async (tx) => {
    await tx.syftPackage.deleteMany({ where: { syftResultsId: syftResult.id } });

    if (syftData.artifacts && syftData.artifacts.length > 0) {
      const packages = syftData.artifacts.map((artifact: any) => {
        // Extract CPE string - handle various formats
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

async function saveDockleResults(metadataId: string, dockleData: any): Promise<void> {
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

  // Delete existing violations and insert new ones atomically
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

async function saveOsvResults(metadataId: string, osvData: any): Promise<void> {
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

  // Delete existing vulnerabilities and insert new ones atomically
  await prisma.$transaction(async (tx) => {
    await tx.osvVulnerability.deleteMany({ where: { osvResultsId: osvResult.id } });

    if (vulnerabilities.length > 0) {
      await tx.osvVulnerability.createMany({ data: vulnerabilities });
    }
  });
}
