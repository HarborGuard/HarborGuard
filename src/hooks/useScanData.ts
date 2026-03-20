"use client";

import { useState, useEffect, useMemo } from "react";
import {
  GrypeReport,
  SyftReport,
  TrivyReport,
  DockleReport,
  OSVReport,
  DiveReport,
} from "@/types";

export function useScanData(scanId: string) {
  const [scanData, setScanData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRawOutput, setShowRawOutput] = useState(false);

  useEffect(() => {
    async function fetchScanData() {
      try {
        const response = await fetch(`/api/scans/${scanId}`);
        if (!response.ok) {
          if (response.status === 404) {
            setError("Scan not found");
          } else {
            setError("Failed to load scan data");
          }
          return;
        }
        const data = await response.json();
        setScanData(data);
      } catch (err) {
        setError("Failed to load scan data");
        console.error("Error fetching scan data:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchScanData();
  }, [scanId]);

  // Check if raw output should be shown
  useEffect(() => {
    fetch("/api/config/raw-output")
      .then((res) => res.json())
      .then((data) => setShowRawOutput(data.enabled))
      .catch(() => setShowRawOutput(false));
  }, []);

  // Use table data first for display, fall back to JSONB for downloads
  const trivyResults: TrivyReport | null = useMemo(() => {
    // If we have table data, transform it to the expected format
    if (scanData?.metadata?.trivyResult) {
      const tableData = scanData.metadata.trivyResult;
      return {
        SchemaVersion: tableData.schemaVersion,
        ArtifactName: tableData.artifactName,
        ArtifactType: tableData.artifactType,
        Results:
          tableData.vulnerabilities?.reduce((acc: any[], vuln: any) => {
            const existingTarget = acc.find(
              (r: any) => r.Target === vuln.targetName
            );
            if (existingTarget) {
              existingTarget.Vulnerabilities.push({
                VulnerabilityID: vuln.vulnerabilityId,
                PkgName: vuln.pkgName,
                InstalledVersion: vuln.installedVersion,
                FixedVersion: vuln.fixedVersion,
                Severity: vuln.severity,
                Title: vuln.title,
                Description: vuln.description,
                PrimaryURL: vuln.primaryUrl,
                CVSS: {
                  nvd: {
                    V3Score: vuln.cvssScoreV3,
                    V3Vector: vuln.cvssVectorV3,
                    V2Score: vuln.cvssScore,
                    V2Vector: vuln.cvssVector,
                  },
                },
              });
            } else {
              acc.push({
                Target: vuln.targetName,
                Class: vuln.targetClass,
                Type: vuln.targetType,
                Vulnerabilities: [
                  {
                    VulnerabilityID: vuln.vulnerabilityId,
                    PkgName: vuln.pkgName,
                    InstalledVersion: vuln.installedVersion,
                    FixedVersion: vuln.fixedVersion,
                    Severity: vuln.severity,
                    Title: vuln.title,
                    Description: vuln.description,
                    PrimaryURL: vuln.primaryUrl,
                    CVSS: {
                      nvd: {
                        V3Score: vuln.cvssScoreV3,
                        V3Vector: vuln.cvssVectorV3,
                        V2Score: vuln.cvssScore,
                        V2Vector: vuln.cvssVector,
                      },
                    },
                  },
                ],
              });
            }
            return acc;
          }, []) || [],
      };
    }
    // Fall back to JSONB data
    return (
      scanData?.metadata?.trivyResults ||
      scanData?.scannerReports?.trivy ||
      scanData?.trivy ||
      null
    );
  }, [scanData]);

  const grypeResults: GrypeReport | null = useMemo(() => {
    // If we have table data, transform it to the expected format
    if (scanData?.metadata?.grypeResult) {
      const tableData = scanData.metadata.grypeResult;
      return {
        matches:
          tableData.vulnerabilities?.map((vuln: any) => ({
            vulnerability: {
              id: vuln.vulnerabilityId,
              severity: vuln.severity,
              namespace: vuln.namespace,
              description: vuln.description,
              fix: {
                state: vuln.fixState,
                versions: vuln.fixVersions,
              },
              cvss: vuln.cvssV3Score
                ? [
                    {
                      version: "3.0",
                      metrics: { baseScore: vuln.cvssV3Score },
                      vector: vuln.cvssV3Vector,
                    },
                  ]
                : vuln.cvssV2Score
                ? [
                    {
                      version: "2.0",
                      metrics: { baseScore: vuln.cvssV2Score },
                      vector: vuln.cvssV2Vector,
                    },
                  ]
                : [],
              urls: vuln.urls,
            },
            artifact: {
              name: vuln.packageName,
              version: vuln.packageVersion,
              type: vuln.packageType,
              language: vuln.packageLanguage,
              locations: vuln.packagePath
                ? [{ path: vuln.packagePath }]
                : [],
            },
          })) || [],
        db: tableData.dbStatus,
      };
    }
    // Fall back to JSONB data
    return (
      scanData?.metadata?.grypeResults ||
      scanData?.scannerReports?.grype ||
      scanData?.grype ||
      null
    );
  }, [scanData]);

  const syftResults: SyftReport | null = useMemo(() => {
    // If we have table data, transform it to the expected format
    if (scanData?.metadata?.syftResult) {
      const tableData = scanData.metadata.syftResult;
      return {
        artifacts:
          tableData.packages?.map((pkg: any) => ({
            id: pkg.packageId,
            name: pkg.name,
            version: pkg.version,
            type: pkg.type,
            foundBy: pkg.foundBy,
            purl: pkg.purl,
            cpes: pkg.cpe ? [pkg.cpe] : [],
            language: pkg.language,
            licenses: pkg.licenses,
            metadata: pkg.metadata,
            locations: pkg.locations,
          })) || [],
        source: tableData.source,
        distro: tableData.distro,
        descriptor: { name: tableData.bomFormat },
        schema: { version: tableData.schemaVersion },
      };
    }
    // Fall back to JSONB data
    return (
      scanData?.metadata?.syftResults ||
      scanData?.scannerReports?.syft ||
      scanData?.syft ||
      null
    );
  }, [scanData]);

  const dockleResults: DockleReport | null = useMemo(() => {
    // If we have table data, transform it to the expected format
    if (scanData?.metadata?.dockleResult) {
      const tableData = scanData.metadata.dockleResult;
      return {
        summary: tableData.summary,
        details:
          tableData.violations?.map((violation: any) => ({
            code: violation.code,
            title: violation.title,
            level: violation.level,
            alerts: violation.alerts,
          })) || [],
      };
    }
    // Fall back to JSONB data
    return (
      scanData?.metadata?.dockleResults ||
      scanData?.scannerReports?.dockle ||
      scanData?.dockle ||
      null
    );
  }, [scanData]);

  const osvResults: OSVReport | null = useMemo(() => {
    // If we have table data, transform it to the expected format
    if (scanData?.metadata?.osvResult) {
      const tableData = scanData.metadata.osvResult;
      const results: any[] = [];

      // Group vulnerabilities by package
      const packageGroups: Record<string, any> = {};
      tableData.vulnerabilities?.forEach((vuln: any) => {
        const key = `${vuln.packageEcosystem}:${vuln.packageName}:${vuln.packageVersion}`;
        if (!packageGroups[key]) {
          packageGroups[key] = {
            package: {
              name: vuln.packageName,
              ecosystem: vuln.packageEcosystem,
              version: vuln.packageVersion,
              purl: vuln.packagePurl,
            },
            vulnerabilities: [],
          };
        }
        packageGroups[key].vulnerabilities.push({
          id: vuln.osvId,
          aliases: vuln.aliases,
          summary: vuln.summary,
          details: vuln.details,
          severity: vuln.severity,
          affected: vuln.affected,
          references: vuln.references,
          published: vuln.published,
          modified: vuln.modified,
          database_specific: vuln.databaseSpecific,
        });
      });

      // Convert to results array
      Object.values(packageGroups).forEach((group) => {
        results.push({
          packages: [group],
        });
      });

      return { results };
    }
    // Fall back to JSONB data
    return (
      scanData?.metadata?.osvResults ||
      scanData?.scannerReports?.osv ||
      scanData?.osv ||
      null
    );
  }, [scanData]);

  const diveResults: DiveReport | null = useMemo(() => {
    // If we have table data, transform it to the expected format
    if (scanData?.metadata?.diveResult) {
      const tableData = scanData.metadata.diveResult;
      return {
        image: {
          efficiencyScore: tableData.efficiencyScore,
          sizeBytes: Number(tableData.sizeBytes),
          inefficientBytes: Number(tableData.wastedBytes),
          inefficientFiles: tableData.inefficientFiles,
          duplicateFiles: tableData.duplicateFiles,
        },
        layer:
          tableData.layers?.map((layer: any) => ({
            id: layer.layerId,
            index: layer.layerIndex,
            digest: layer.digest,
            sizeBytes: Number(layer.sizeBytes),
            command: layer.command,
            addedFiles: layer.addedFiles,
            modifiedFiles: layer.modifiedFiles,
            removedFiles: layer.removedFiles,
            wastedBytes: Number(layer.wastedBytes),
            fileDetails: layer.fileDetails,
          })) || [],
      };
    }
    // Fall back to JSONB data
    return (
      scanData?.metadata?.diveResults ||
      scanData?.scannerReports?.dive ||
      scanData?.dive ||
      null
    );
  }, [scanData]);

  return {
    scanData,
    loading,
    error,
    showRawOutput,
    trivyResults,
    grypeResults,
    syftResults,
    dockleResults,
    osvResults,
    diveResults,
  };
}
