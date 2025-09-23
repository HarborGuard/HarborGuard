"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  IconBug,
  IconPackage,
  IconShield,
  IconSettings,
  IconDownload,
  IconExternalLink,
  IconInfoCircle,
  IconClock,
  IconStack,
  IconSearch,
  IconSortAscending,
  IconSortDescending,
  IconChevronDown,
  IconMessage,
  IconX,
} from "@tabler/icons-react";

import { AppSidebar } from "@/components/app-sidebar";
import { ScanDetailsNormalized } from "@/components/scan/ScanDetailsNormalized";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { VulnerabilityUrlMenu } from "@/components/vulnerability-url-menu";
import { VulnerabilityDetailsModal } from "@/components/vulnerability-details-modal";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScanDetailsSkeleton } from "@/components/image-loading";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  GrypeReport,
  SyftReport,
  TrivyReport,
  DockleReport,
  OSVReport,
  DiveReport,
} from "@/types";
import { CveClassificationDialog } from "@/components/cve-classification-dialog";
import { useCveClassifications } from "@/hooks/useCveClassifications";
import { PatchAnalysis } from "@/components/patch-analysis";

export default function ScanResultsPage() {
  const params = useParams();
  const imageName = params.name as string;
  const scanId = params.scanId as string;

  // All useState hooks must be at the top before any conditional returns
  const [scanData, setScanData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trivySearch, setTrivySearch] = React.useState("");
  const [grypeSearch, setGrypeSearch] = React.useState("");
  const [dockleSearch, setDockleSearch] = React.useState("");
  const [trivySortField, setTrivySortField] =
    React.useState<string>("severity");
  const [trivySortOrder, setTrivySortOrder] = React.useState<"asc" | "desc">(
    "desc"
  );
  const [dockleSortField, setDockleSortField] = React.useState<string>("level");
  const [dockleSortOrder, setDockleSortOrder] = React.useState<"asc" | "desc">(
    "desc"
  );
  const [syftCurrentPage, setSyftCurrentPage] = React.useState(1);
  const [syftItemsPerPage, setSyftItemsPerPage] = React.useState(20);
  const [selectedLayer, setSelectedLayer] = React.useState<string>("0");
  const [classificationDialogOpen, setClassificationDialogOpen] =
    React.useState(false);
  const [selectedCveId, setSelectedCveId] = React.useState<string>("");
  const [showFalsePositives, setShowFalsePositives] = React.useState(true);
  const [selectedVulnerability, setSelectedVulnerability] = React.useState<any>(null);
  const [isVulnModalOpen, setIsVulnModalOpen] = React.useState(false);
  const [viewMode, setViewMode] = React.useState<'normalized' | 'raw'>('normalized');
  const [showRawOutput, setShowRawOutput] = React.useState(false);

  // Decode the image name in case it has special characters
  const decodedImageName = decodeURIComponent(imageName);

  // Image-name-wide CVE Classifications
  const [consolidatedClassifications, setConsolidatedClassifications] =
    useState<any[]>([]);
  const [classificationsLoading, setClassificationsLoading] = useState(true);

  // Helper functions for classifications
  const getClassification = (cveId: string) => {
    return consolidatedClassifications.find((c) => {
      // Check both direct cveId and nested structure
      const directCveId = c.cveId;
      const nestedCveId = c.imageVulnerability?.vulnerability?.cveId;
      return directCveId === cveId || nestedCveId === cveId;
    });
  };

  const isFalsePositive = (cveId: string) => {
    const classification = getClassification(cveId);
    return classification?.isFalsePositive ?? false;
  };

  const getComment = (cveId: string) => {
    const classification = getClassification(cveId);
    return classification?.comment || undefined;
  };

  const saveClassification = async (classification: any) => {
    try {
      // Save to all tags of this image name using the new endpoint
      const response = await fetch(
        `/api/images/name/${encodeURIComponent(
          decodedImageName
        )}/cve-classifications`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(classification),
        }
      );

      if (!response.ok) {
        // Fallback: save to the specific image only
        const fallbackResponse = await fetch(
          `/api/images/${scanData?.image?.id}/cve-classifications`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(classification),
          }
        );

        if (!fallbackResponse.ok) {
          throw new Error("Failed to save classification");
        }
      }

      // Refresh classifications
      fetchConsolidatedClassifications();
    } catch (error) {
      console.error("Failed to save CVE classification:", error);
      throw error;
    }
  };

  const deleteClassification = async (cveId: string) => {
    // For deletion, we'll remove from the specific image to maintain existing functionality
    try {
      const response = await fetch(
        `/api/images/${
          scanData?.image?.id
        }/cve-classifications/${encodeURIComponent(cveId)}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        throw new Error("Failed to delete classification");
      }

      // Refresh classifications
      fetchConsolidatedClassifications();
    } catch (error) {
      console.error("Failed to delete CVE classification:", error);
      throw error;
    }
  };

  const fetchConsolidatedClassifications = async () => {
    if (!decodedImageName) return;

    try {
      setClassificationsLoading(true);

      // Try the new consolidated endpoint first
      const response = await fetch(
        `/api/images/name/${encodeURIComponent(
          decodedImageName
        )}/cve-classifications`
      );
      if (response.ok) {
        const consolidated = await response.json();
        console.log(
          `✅ Loaded ${consolidated.length} consolidated CVE classifications for ${decodedImageName}`
        );
        setConsolidatedClassifications(consolidated);
        return;
      }

      // Fallback: just use the current image's classifications
      if (scanData?.image?.id) {
        const fallbackResponse = await fetch(
          `/api/images/${scanData.image.id}/cve-classifications`
        );
        if (fallbackResponse.ok) {
          const classifications = await fallbackResponse.json();
          console.log(
            `📦 Fallback: Loaded ${classifications.length} CVE classifications for current image`
          );
          setConsolidatedClassifications(classifications);
        }
      }
    } catch (error) {
      console.error("Error fetching consolidated classifications:", error);
    } finally {
      setClassificationsLoading(false);
    }
  };

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

  // Fetch consolidated classifications when scan data is available
  useEffect(() => {
    if (scanData && decodedImageName) {
      fetchConsolidatedClassifications();
    }
  }, [scanData, decodedImageName]);
  
  // Check if raw output should be shown
  useEffect(() => {
    fetch('/api/config/raw-output')
      .then(res => res.json())
      .then(data => setShowRawOutput(data.enabled))
      .catch(() => setShowRawOutput(false));
  }, []);

  // Use table data first for display, fall back to JSONB for downloads
  const trivyResults: TrivyReport | null = React.useMemo(() => {
    // If we have table data, transform it to the expected format
    if (scanData?.metadata?.trivyResult) {
      const tableData = scanData.metadata.trivyResult;
      return {
        SchemaVersion: tableData.schemaVersion,
        ArtifactName: tableData.artifactName,
        ArtifactType: tableData.artifactType,
        Results: tableData.vulnerabilities?.reduce((acc: any[], vuln: any) => {
          const existingTarget = acc.find((r: any) => r.Target === vuln.targetName);
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
                  V2Vector: vuln.cvssVector
                }
              }
            });
          } else {
            acc.push({
              Target: vuln.targetName,
              Class: vuln.targetClass,
              Type: vuln.targetType,
              Vulnerabilities: [{
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
                    V2Vector: vuln.cvssVector
                  }
                }
              }]
            });
          }
          return acc;
        }, []) || []
      };
    }
    // Fall back to JSONB data
    return scanData?.metadata?.trivyResults ||
      scanData?.scannerReports?.trivy ||
      scanData?.trivy ||
      null;
  }, [scanData]);

  const grypResults: GrypeReport | null = React.useMemo(() => {
    // If we have table data, transform it to the expected format
    if (scanData?.metadata?.grypeResult) {
      const tableData = scanData.metadata.grypeResult;
      return {
        matches: tableData.vulnerabilities?.map((vuln: any) => ({
          vulnerability: {
            id: vuln.vulnerabilityId,
            severity: vuln.severity,
            namespace: vuln.namespace,
            description: vuln.description,
            fix: {
              state: vuln.fixState,
              versions: vuln.fixVersions
            },
            cvss: vuln.cvssV3Score ? [{
              version: '3.0',
              metrics: { baseScore: vuln.cvssV3Score },
              vector: vuln.cvssV3Vector
            }] : vuln.cvssV2Score ? [{
              version: '2.0',
              metrics: { baseScore: vuln.cvssV2Score },
              vector: vuln.cvssV2Vector
            }] : [],
            urls: vuln.urls
          },
          artifact: {
            name: vuln.packageName,
            version: vuln.packageVersion,
            type: vuln.packageType,
            language: vuln.packageLanguage,
            locations: vuln.packagePath ? [{ path: vuln.packagePath }] : []
          }
        })) || [],
        db: tableData.dbStatus
      };
    }
    // Fall back to JSONB data
    return scanData?.metadata?.grypeResults ||
      scanData?.scannerReports?.grype ||
      scanData?.grype ||
      null;
  }, [scanData]);

  const syftResults: SyftReport | null = React.useMemo(() => {
    // If we have table data, transform it to the expected format
    if (scanData?.metadata?.syftResult) {
      const tableData = scanData.metadata.syftResult;
      return {
        artifacts: tableData.packages?.map((pkg: any) => ({
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
          locations: pkg.locations
        })) || [],
        source: tableData.source,
        distro: tableData.distro,
        descriptor: { name: tableData.bomFormat },
        schema: { version: tableData.schemaVersion }
      };
    }
    // Fall back to JSONB data
    return scanData?.metadata?.syftResults ||
      scanData?.scannerReports?.syft ||
      scanData?.syft ||
      null;
  }, [scanData]);

  const dockleResults: DockleReport | null = React.useMemo(() => {
    // If we have table data, transform it to the expected format
    if (scanData?.metadata?.dockleResult) {
      const tableData = scanData.metadata.dockleResult;
      return {
        summary: tableData.summary,
        details: tableData.violations?.map((violation: any) => ({
          code: violation.code,
          title: violation.title,
          level: violation.level,
          alerts: violation.alerts
        })) || []
      };
    }
    // Fall back to JSONB data
    return scanData?.metadata?.dockleResults ||
      scanData?.scannerReports?.dockle ||
      scanData?.dockle ||
      null;
  }, [scanData]);

  const osvResults: OSVReport | null = React.useMemo(() => {
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
              purl: vuln.packagePurl
            },
            vulnerabilities: []
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
          database_specific: vuln.databaseSpecific
        });
      });
      
      // Convert to results array
      Object.values(packageGroups).forEach(group => {
        results.push({
          packages: [group]
        });
      });
      
      return { results };
    }
    // Fall back to JSONB data
    return scanData?.metadata?.osvResults ||
      scanData?.scannerReports?.osv ||
      scanData?.osv ||
      null;
  }, [scanData]);

  const diveResults: DiveReport | null = React.useMemo(() => {
    // If we have table data, transform it to the expected format
    if (scanData?.metadata?.diveResult) {
      const tableData = scanData.metadata.diveResult;
      return {
        image: {
          efficiencyScore: tableData.efficiencyScore,
          sizeBytes: Number(tableData.sizeBytes),
          inefficientBytes: Number(tableData.wastedBytes),
          inefficientFiles: tableData.inefficientFiles,
          duplicateFiles: tableData.duplicateFiles
        },
        layer: tableData.layers?.map((layer: any) => ({
          id: layer.layerId,
          index: layer.layerIndex,
          digest: layer.digest,
          sizeBytes: Number(layer.sizeBytes),
          command: layer.command,
          addedFiles: layer.addedFiles,
          modifiedFiles: layer.modifiedFiles,
          removedFiles: layer.removedFiles,
          wastedBytes: Number(layer.wastedBytes),
          fileDetails: layer.fileDetails
        })) || []
      };
    }
    // Fall back to JSONB data
    return scanData?.metadata?.diveResults ||
      scanData?.scannerReports?.dive ||
      scanData?.dive ||
      null;
  }, [scanData]);

  // Debug: Log scanner results to console
  console.log("🔍 Debug Scan Data Structure:", {
    scanData: scanData ? Object.keys(scanData) : "null",
    hasMetadata: !!scanData?.metadata,
    hasTrivyResults: !!scanData?.metadata?.trivyResults,
    hasGrypeResults: !!scanData?.metadata?.grypeResults,
    hasTrivyDirect: !!scanData?.trivy,
    hasGrypeDirect: !!scanData?.grype,
    hasScannerReports: !!scanData?.scannerReports,
  });
  console.log("OSV Results:", osvResults);
  console.log("Dive Results:", diveResults);
  console.log("Trivy Results:", trivyResults);
  console.log("Grype Results:", grypResults);

  const breadcrumbs = [
    { label: "Dashboard", href: "/" },
    {
      label: decodedImageName,
      href: `/image/${encodeURIComponent(decodedImageName)}`,
    },
    { label: `Scan ${scanData?.requestId}` },
  ];

  // Search and filter states are now declared at the top

  // CVE Classification handlers
  const handleOpenClassificationDialog = (cveId: string) => {
    setSelectedCveId(cveId);
    setClassificationDialogOpen(true);
  };

  const handleCloseClassificationDialog = () => {
    setClassificationDialogOpen(false);
    setSelectedCveId("");
  };

  const handleVulnerabilityClick = (vuln: any, source: 'trivy' | 'grype') => {
    // Transform the vulnerability data to match the modal's expected format
    const transformedVuln = {
      cveId: source === 'trivy' ? vuln.VulnerabilityID : vuln.vulnerability?.id,
      severity: source === 'trivy' ? vuln.Severity?.toLowerCase() : vuln.vulnerability?.severity?.toLowerCase(),
      description: source === 'trivy' 
        ? (vuln.Description || vuln.Title) 
        : vuln.vulnerability?.description,
      cvssScore: source === 'trivy' 
        ? (vuln.CVSS?.nvd?.V3Score || vuln.CVSS?.redhat?.V3Score)
        : vuln.vulnerability?.cvss?.[0]?.metrics?.baseScore,
      cvssVector: source === 'trivy'
        ? (vuln.CVSS?.nvd?.V3Vector || vuln.CVSS?.redhat?.V3Vector)
        : vuln.vulnerability?.cvss?.[0]?.vector,
      packageName: source === 'trivy' ? vuln.PkgName : vuln.artifact?.name,
      installedVersion: source === 'trivy' ? vuln.InstalledVersion : vuln.artifact?.version,
      fixedVersion: source === 'trivy' 
        ? vuln.FixedVersion 
        : vuln.vulnerability?.fix?.versions?.[0],
      publishedDate: source === 'trivy' 
        ? vuln.PublishedDate 
        : vuln.vulnerability?.dataSource,
      references: source === 'trivy' 
        ? (vuln.References || [])
        : (vuln.vulnerability?.urls || []),
      affectedImages: [{
        imageName: decodedImageName,
        imageId: scanData?.imageId || '',
        isFalsePositive: isFalsePositive(source === 'trivy' ? vuln.VulnerabilityID : vuln.vulnerability?.id)
      }],
      falsePositiveImages: []
    };
    
    setSelectedVulnerability(transformedVuln);
    setIsVulnModalOpen(true);
  };

  const getSeverityColor = (severity: string) => {
    switch (severity.toLowerCase()) {
      case "critical":
        return "destructive";
      case "high":
        return "destructive";
      case "medium":
        return "secondary";
      case "low":
        return "outline";
      default:
        return "outline";
    }
  };

  const getSeverityWeight = (severity: string) => {
    switch (severity.toLowerCase()) {
      case "critical":
        return 4;
      case "high":
        return 3;
      case "medium":
        return 2;
      case "low":
        return 1;
      default:
        return 0;
    }
  };

  const getLevelWeight = (level: string) => {
    switch (level.toUpperCase()) {
      case "FATAL":
        return 3;
      case "WARN":
        return 2;
      case "INFO":
        return 1;
      default:
        return 0;
    }
  };

  // Filter and sort Trivy vulnerabilities
  const filteredTrivyVulns = React.useMemo(() => {
    if (!trivyResults?.Results) return [];

    // Extract vulnerabilities from all results
    const allVulns = trivyResults.Results.flatMap(
      (result) => result.Vulnerabilities || []
    );

    let filtered = allVulns.filter((vuln) => {
      // Search filter
      const matchesSearch =
        (vuln.VulnerabilityID || "")
          .toLowerCase()
          .includes(trivySearch.toLowerCase()) ||
        (vuln.PkgName || "")
          .toLowerCase()
          .includes(trivySearch.toLowerCase()) ||
        (vuln.Title || "").toLowerCase().includes(trivySearch.toLowerCase()) ||
        (vuln.Severity || "").toLowerCase().includes(trivySearch.toLowerCase());

      // False positive filter
      const isMarkedFalsePositive = isFalsePositive(vuln.VulnerabilityID);
      const passesClassificationFilter =
        showFalsePositives || !isMarkedFalsePositive;

      return matchesSearch && passesClassificationFilter;
    });

    return filtered.sort((a, b) => {
      let aValue: any, bValue: any;

      switch (trivySortField) {
        case "severity":
          aValue = getSeverityWeight(a.Severity || "");
          bValue = getSeverityWeight(b.Severity || "");
          break;
        case "cvss":
          aValue = a.CVSS?.nvd?.V3Score || a.CVSS?.redhat?.V3Score || 0;
          bValue = b.CVSS?.nvd?.V3Score || b.CVSS?.redhat?.V3Score || 0;
          break;
        case "package":
          aValue = a.PkgName || "";
          bValue = b.PkgName || "";
          break;
        case "vulnerability":
          aValue = a.VulnerabilityID || "";
          bValue = b.VulnerabilityID || "";
          break;
        default:
          return 0;
      }

      if (trivySortOrder === "asc") {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });
  }, [
    trivyResults,
    trivySearch,
    trivySortField,
    trivySortOrder,
    showFalsePositives,
    isFalsePositive,
  ]);

  // Filter and sort Grype vulnerabilities
  const filteredGrypeVulns = React.useMemo(() => {
    if (!grypResults?.matches) return [];

    let filtered = grypResults.matches.filter((match) => {
      // Search filter
      const matchesSearch =
        (match.vulnerability.id || "")
          .toLowerCase()
          .includes(grypeSearch.toLowerCase()) ||
        (match.artifact.name || "")
          .toLowerCase()
          .includes(grypeSearch.toLowerCase()) ||
        (match.vulnerability.description || "")
          .toLowerCase()
          .includes(grypeSearch.toLowerCase()) ||
        (match.vulnerability.severity || "")
          .toLowerCase()
          .includes(grypeSearch.toLowerCase());

      // False positive filter
      const isMarkedFalsePositive = isFalsePositive(match.vulnerability.id);
      const passesClassificationFilter =
        showFalsePositives || !isMarkedFalsePositive;

      return matchesSearch && passesClassificationFilter;
    });

    return filtered.sort((a, b) => {
      // Sort by severity by default
      const aWeight = getSeverityWeight(a.vulnerability.severity || "");
      const bWeight = getSeverityWeight(b.vulnerability.severity || "");
      return bWeight - aWeight;
    });
  }, [grypResults, grypeSearch, showFalsePositives, isFalsePositive]);

  // Filter and sort Dockle findings
  const filteredDockleFindings = React.useMemo(() => {
    if (!dockleResults?.details) return [];

    let filtered = dockleResults.details.filter(
      (detail) =>
        detail.code.toLowerCase().includes(dockleSearch.toLowerCase()) ||
        detail.title.toLowerCase().includes(dockleSearch.toLowerCase()) ||
        detail.details.toLowerCase().includes(dockleSearch.toLowerCase()) ||
        detail.level.toLowerCase().includes(dockleSearch.toLowerCase())
    );

    return filtered.sort((a, b) => {
      let aValue: any, bValue: any;

      switch (dockleSortField) {
        case "level":
          aValue = getLevelWeight(a.level);
          bValue = getLevelWeight(b.level);
          break;
        case "code":
          aValue = a.code;
          bValue = b.code;
          break;
        case "title":
          aValue = a.title;
          bValue = b.title;
          break;
        default:
          return 0;
      }

      if (dockleSortOrder === "asc") {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });
  }, [dockleResults, dockleSearch, dockleSortField, dockleSortOrder]);

  if (loading) {
    return (
      <div className="flex-1 overflow-auto">
        <ScanDetailsSkeleton />
      </div>
    );
  }

  if (error || !scanData) {
    const breadcrumbs = [
      { label: "Dashboard", href: "/" },
      {
        label: decodedImageName,
        href: `/image/${encodeURIComponent(decodedImageName)}`,
      },
      { label: `Scan ${scanId}` },
    ];

    return (
      <div className="flex-1 overflow-auto">
        <div className="@container/main flex flex-col gap-4 p-4 lg:p-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-500">
                <IconInfoCircle className="h-5 w-5" />
                Scan Not Found
              </CardTitle>
              <CardDescription>
                {error || "The requested scan could not be found"}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4 py-8">
              <p className="text-muted-foreground text-center">
                Scan "{scanId}" for image "{decodedImageName}" does not exist or
                may have been removed.
              </p>
              <Button asChild>
                <a href={`/image/${encodeURIComponent(decodedImageName)}`}>
                  Go Back to Image
                </a>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const handleTrivySort = (field: string) => {
    if (trivySortField === field) {
      setTrivySortOrder(trivySortOrder === "asc" ? "desc" : "asc");
    } else {
      setTrivySortField(field);
      setTrivySortOrder("desc");
    }
  };

  const handleDockleSort = (field: string) => {
    if (dockleSortField === field) {
      setDockleSortOrder(dockleSortOrder === "asc" ? "desc" : "asc");
    } else {
      setDockleSortField(field);
      setDockleSortOrder("desc");
    }
  };

  const handleDownloadZip = async () => {
    try {
      const response = await fetch(
        `/api/image/${encodeURIComponent(
          decodedImageName
        )}/scan/${scanId}/download`
      );
      if (!response.ok) {
        throw new Error("Download failed");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${decodedImageName.replace(
        "/",
        "_"
      )}_${scanId}_reports.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download failed:", error);
      // Could add toast notification here
    }
  };

  const handleDownloadReport = async (reportType: string) => {
    try {
      const response = await fetch(
        `/api/image/${encodeURIComponent(
          decodedImageName
        )}/scan/${scanId}/${reportType}`
      );
      if (!response.ok) {
        throw new Error("Download failed");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${decodedImageName.replace(
        "/",
        "_"
      )}_${scanId}_${reportType}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download failed:", error);
      // Could add toast notification here
    }
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="@container/main flex flex-col gap-4 p-4 lg:p-6">
        {/* Scan Summary */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <IconClock className="h-5 w-5" />
                Scan Summary
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleDownloadZip}
                  className="flex items-center gap-2"
                >
                  <IconDownload className="h-4 w-4" />
                  Export Report
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon">
                      <IconChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {trivyResults && (
                      <DropdownMenuItem
                        onClick={() => handleDownloadReport("trivy")}
                      >
                        <IconBug className="h-4 w-4 mr-2" />
                        Trivy Report
                      </DropdownMenuItem>
                    )}
                    {grypResults && (
                      <DropdownMenuItem
                        onClick={() => handleDownloadReport("grype")}
                      >
                        <IconShield className="h-4 w-4 mr-2" />
                        Grype Report
                      </DropdownMenuItem>
                    )}
                    {syftResults && (
                      <DropdownMenuItem
                        onClick={() => handleDownloadReport("syft")}
                      >
                        <IconPackage className="h-4 w-4 mr-2" />
                        Syft Report
                      </DropdownMenuItem>
                    )}
                    {dockleResults && (
                      <DropdownMenuItem
                        onClick={() => handleDownloadReport("dockle")}
                      >
                        <IconSettings className="h-4 w-4 mr-2" />
                        Dockle Report
                      </DropdownMenuItem>
                    )}
                    {osvResults && (
                      <DropdownMenuItem
                        onClick={() => handleDownloadReport("osv")}
                      >
                        <IconPackage className="h-4 w-4 mr-2" />
                        OSV Report
                      </DropdownMenuItem>
                    )}
                    {diveResults && (
                      <DropdownMenuItem
                        onClick={() => handleDownloadReport("dive")}
                      >
                        <IconStack className="h-4 w-4 mr-2" />
                        Dive Report
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Scan Date
                </p>
                <p className="text-sm">
                  {scanData.startedAt
                    ? new Date(scanData.startedAt).toLocaleString()
                    : "N/A"}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Duration
                </p>
                <p className="text-sm">
                  {scanData.startedAt && scanData.finishedAt
                    ? (() => {
                        const start = new Date(scanData.startedAt);
                        const end = new Date(scanData.finishedAt);
                        const diffMs = end.getTime() - start.getTime();
                        const minutes = Math.floor(diffMs / 60000);
                        const seconds = Math.floor((diffMs % 60000) / 1000);
                        return `${minutes}m ${seconds}s`;
                      })()
                    : scanData.status === "RUNNING"
                    ? "Running..."
                    : "N/A"}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Tools Used
                </p>
                <div className="flex gap-1 flex-wrap mt-1">
                  <Badge
                    variant="outline"
                    className="text-xs hover:bg-muted/50 transition-colors"
                  >
                    <a
                      href="https://github.com/aquasecurity/trivy"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center"
                    >
                      Trivy
                    </a>
                  </Badge>
                  <Badge
                    variant="outline"
                    className="text-xs hover:bg-muted/50 transition-colors"
                  >
                    <a
                      href="https://github.com/anchore/grype"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center"
                    >
                      Grype
                    </a>
                  </Badge>
                  <Badge
                    variant="outline"
                    className="text-xs hover:bg-muted/50 transition-colors"
                  >
                    <a
                      href="https://github.com/anchore/syft"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center"
                    >
                      Syft
                    </a>
                  </Badge>
                  <Badge
                    variant="outline"
                    className="text-xs hover:bg-muted/50 transition-colors"
                  >
                    <a
                      href="https://github.com/goodwithtech/dockle"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center"
                    >
                      Dockle
                    </a>
                  </Badge>
                  {osvResults && (
                    <Badge
                      variant="outline"
                      className="text-xs hover:bg-muted/50 transition-colors"
                    >
                      <a
                        href="https://github.com/google/osv-scanner"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center"
                      >
                        OSV
                      </a>
                    </Badge>
                  )}
                  {diveResults && (
                    <Badge
                      variant="outline"
                      className="text-xs hover:bg-muted/50 transition-colors"
                    >
                      <a
                        href="https://github.com/wagoodman/dive"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center"
                      >
                        Dive
                      </a>
                    </Badge>
                  )}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Status
                </p>
                <Badge className="bg-green-500 text-white hover:bg-green-600">
                  Complete
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* View Mode Toggle - Only show if raw output is enabled */}
        {showRawOutput ? (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Scan Results View</CardTitle>
                <div className="flex items-center gap-2">
                  <Button
                    variant={viewMode === 'normalized' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setViewMode('normalized')}
                  >
                    <IconShield className="h-4 w-4 mr-2" />
                    Normalized View
                  </Button>
                  <Button
                    variant={viewMode === 'raw' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setViewMode('raw')}
                  >
                    <IconBug className="h-4 w-4 mr-2" />
                    Raw Scanner Output
                  </Button>
                </div>
              </div>
            </CardHeader>
          </Card>
        ) : null}

        {/* Patch Analysis Component */}
        {scanData && (
          <PatchAnalysis 
            scanId={scanId} 
            imageId={scanData.imageId || scanData.scan?.imageId}
            imageName={imageName}
            imageTag={scanData.image?.tag || scanData.scan?.image?.tag || 'latest'}
            onPatchExecute={(patchOperation) => {
              console.log('Patch operation started:', patchOperation);
              // You can add additional handling here, like showing a notification
            }}
          />
        )}

        {/* Display based on view mode - Always show normalized if raw is disabled */}
        {!showRawOutput || viewMode === 'normalized' ? (
          <ScanDetailsNormalized
            scanId={scanId}
            scanData={scanData}
            showFalsePositives={showFalsePositives}
            consolidatedClassifications={consolidatedClassifications}
            onClassificationChange={fetchConsolidatedClassifications}
          />
        ) : (
        <Tabs defaultValue="trivy" className="w-full">
          <TabsList
            className={`grid w-full ${
              diveResults?.layer && diveResults.layer.length > 0 && osvResults
                ? "grid-cols-6"
                : (diveResults?.layer && diveResults.layer.length > 0) ||
                  osvResults
                ? "grid-cols-5"
                : "grid-cols-4"
            }`}
          >
            <TabsTrigger value="trivy" className="flex items-center gap-2">
              <IconBug className="h-4 w-4" />
              Trivy
            </TabsTrigger>
            <TabsTrigger value="grype" className="flex items-center gap-2">
              <IconShield className="h-4 w-4" />
              Grype
            </TabsTrigger>
            <TabsTrigger value="syft" className="flex items-center gap-2">
              <IconPackage className="h-4 w-4" />
              Syft
            </TabsTrigger>
            <TabsTrigger value="dockle" className="flex items-center gap-2">
              <IconSettings className="h-4 w-4" />
              Dockle
            </TabsTrigger>
            {osvResults && (
              <TabsTrigger value="osv" className="flex items-center gap-2">
                <IconPackage className="h-4 w-4" />
                OSV
              </TabsTrigger>
            )}
            {diveResults?.layer && diveResults.layer.length > 0 && (
              <TabsTrigger value="dive" className="flex items-center gap-2">
                <IconStack className="h-4 w-4" />
                Layers ({diveResults.layer.length})
              </TabsTrigger>
            )}
          </TabsList>

          {/* Trivy Results */}
          <TabsContent value="trivy" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <IconBug className="h-5 w-5" />
                  Trivy Vulnerability Scan
                </CardTitle>
                <CardDescription>
                  Comprehensive vulnerability scanner for containers
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Search and Filter Bar */}
                  <div className="flex items-center gap-4">
                    <div className="relative flex-1">
                      <IconSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                      <Input
                        placeholder="Search vulnerabilities, packages, or CVE IDs..."
                        value={trivySearch}
                        onChange={(e) => setTrivySearch(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                    <Button
                      variant={showFalsePositives ? "outline" : "secondary"}
                      size="sm"
                      onClick={() => setShowFalsePositives(!showFalsePositives)}
                      className="flex items-center gap-2"
                      disabled={classificationsLoading}
                    >
                      {classificationsLoading && (
                        <div className="animate-spin h-3 w-3 border border-current border-t-transparent rounded-full" />
                      )}
                      {showFalsePositives ? "Hide" : "Show"} False Positives
                    </Button>
                    <div className="text-sm text-muted-foreground">
                      {filteredTrivyVulns.length} of{" "}
                      {trivyResults?.Results?.reduce(
                        (count, result) =>
                          count + (result.Vulnerabilities?.length || 0),
                        0
                      ) || 0}{" "}
                      vulnerabilities
                    </div>
                  </div>

                  {/* Vulnerabilities Table */}
                  <div className="border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Actions</TableHead>
                          <TableHead>
                            <Button
                              variant="ghost"
                              className="h-auto p-0 font-medium"
                              onClick={() => handleTrivySort("severity")}
                            >
                              Severity
                              {trivySortField === "severity" &&
                                (trivySortOrder === "asc" ? (
                                  <IconSortAscending className="ml-1 h-4 w-4" />
                                ) : (
                                  <IconSortDescending className="ml-1 h-4 w-4" />
                                ))}
                            </Button>
                          </TableHead>
                          <TableHead>
                            <Button
                              variant="ghost"
                              className="h-auto p-0 font-medium"
                              onClick={() => handleTrivySort("vulnerability")}
                            >
                              Vulnerability
                              {trivySortField === "vulnerability" &&
                                (trivySortOrder === "asc" ? (
                                  <IconSortAscending className="ml-1 h-4 w-4" />
                                ) : (
                                  <IconSortDescending className="ml-1 h-4 w-4" />
                                ))}
                            </Button>
                          </TableHead>
                          <TableHead>
                            <Button
                              variant="ghost"
                              className="h-auto p-0 font-medium"
                              onClick={() => handleTrivySort("package")}
                            >
                              Package
                              {trivySortField === "package" &&
                                (trivySortOrder === "asc" ? (
                                  <IconSortAscending className="ml-1 h-4 w-4" />
                                ) : (
                                  <IconSortDescending className="ml-1 h-4 w-4" />
                                ))}
                            </Button>
                          </TableHead>
                          <TableHead>
                            <Button
                              variant="ghost"
                              className="h-auto p-0 font-medium"
                              onClick={() => handleTrivySort("cvss")}
                            >
                              CVSS Score
                              {trivySortField === "cvss" &&
                                (trivySortOrder === "asc" ? (
                                  <IconSortAscending className="ml-1 h-4 w-4" />
                                ) : (
                                  <IconSortDescending className="ml-1 h-4 w-4" />
                                ))}
                            </Button>
                          </TableHead>
                          <TableHead>Fixed Version</TableHead>
                          <TableHead>Published</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredTrivyVulns.map((vuln, index) => {
                          const classification = getClassification(
                            vuln.VulnerabilityID
                          );
                          const isMarkedFalsePositive = isFalsePositive(
                            vuln.VulnerabilityID
                          );
                          const comment = getComment(vuln.VulnerabilityID);

                          return (
                            <TableRow
                              key={index}
                              className={`${
                                isMarkedFalsePositive ? "opacity-50" : ""
                              } hover:bg-muted/50 cursor-pointer`}
                              onClick={() => handleVulnerabilityClick(vuln, 'trivy')}
                            >
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      handleOpenClassificationDialog(
                                        vuln.VulnerabilityID
                                      )
                                    }
                                    className="flex items-center gap-1"
                                  >
                                    <IconMessage className="h-4 w-4" />
                                    {classification ? "Edit" : "Classify"}
                                  </Button>
                                  {classification && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() =>
                                        deleteClassification(
                                          vuln.VulnerabilityID
                                        )
                                      }
                                      className="text-red-500 hover:text-red-700"
                                    >
                                      <IconX className="h-4 w-4" />
                                    </Button>
                                  )}
                                  <VulnerabilityUrlMenu
                                    vulnerabilityId={vuln.VulnerabilityID}
                                    references={
                                      vuln.references || vuln.References || []
                                    }
                                  />
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Badge
                                    variant={
                                      getSeverityColor(
                                        vuln.Severity || ""
                                      ) as any
                                    }
                                  >
                                    {vuln.Severity}
                                  </Badge>
                                  {isMarkedFalsePositive && (
                                    <Badge
                                      variant="outline"
                                      className="text-xs"
                                    >
                                      False Positive
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <p className="font-medium">
                                      {vuln.VulnerabilityID}
                                    </p>
                                    {comment && (
                                      <IconMessage
                                        className="h-4 w-4 text-muted-foreground"
                                        title={comment}
                                      />
                                    )}
                                  </div>
                                  <p className="text-sm text-muted-foreground">
                                    {vuln.Title || vuln.Description}
                                  </p>
                                  {comment && (
                                    <p className="text-xs text-blue-600 mt-1">
                                      💬 {comment.slice(0, 50)}
                                      {comment.length > 50 ? "..." : ""}
                                    </p>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div>
                                  <p className="font-medium">{vuln.PkgName}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {vuln.InstalledVersion}
                                  </p>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">
                                  {vuln.CVSS?.nvd?.V3Score ||
                                    vuln.CVSS?.redhat?.V3Score ||
                                    "N/A"}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {vuln.FixedVersion ? (
                                  <Badge variant="default">
                                    {vuln.FixedVersion}
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary">No fix</Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                {vuln.publishedDate
                                  ? new Date(
                                      vuln.publishedDate
                                    ).toLocaleDateString()
                                  : "—"}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Grype Results */}
          <TabsContent value="grype" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <IconShield className="h-5 w-5" />
                  Grype Vulnerability Scanner
                </CardTitle>
                <CardDescription>
                  Container vulnerability scanner by Anchore
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Search and Filter Bar */}
                  <div className="flex items-center gap-4">
                    <div className="relative flex-1">
                      <IconSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                      <Input
                        placeholder="Search vulnerabilities, packages, or CVE IDs..."
                        value={grypeSearch}
                        onChange={(e) => setGrypeSearch(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                    <Button
                      variant={showFalsePositives ? "outline" : "secondary"}
                      size="sm"
                      onClick={() => setShowFalsePositives(!showFalsePositives)}
                      className="flex items-center gap-2"
                      disabled={classificationsLoading}
                    >
                      {classificationsLoading && (
                        <div className="animate-spin h-3 w-3 border border-current border-t-transparent rounded-full" />
                      )}
                      {showFalsePositives ? "Hide" : "Show"} False Positives
                    </Button>
                    <div className="text-sm text-muted-foreground">
                      {filteredGrypeVulns.length} of{" "}
                      {grypResults?.matches?.length || 0} vulnerabilities
                    </div>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Actions</TableHead>
                        <TableHead>Severity</TableHead>
                        <TableHead>Vulnerability</TableHead>
                        <TableHead>Package</TableHead>
                        <TableHead>Version</TableHead>
                        <TableHead>Fix Available</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredGrypeVulns.map((match, index) => {
                        const classification = getClassification(
                          match.vulnerability.id
                        );
                        const isMarkedFalsePositive = isFalsePositive(
                          match.vulnerability.id
                        );
                        const comment = getComment(match.vulnerability.id);

                        return (
                          <TableRow
                            key={index}
                            className={`${
                              isMarkedFalsePositive ? "opacity-50" : ""
                            } hover:bg-muted/50 cursor-pointer`}
                            onClick={() => handleVulnerabilityClick(match, 'grype')}
                          >
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    handleOpenClassificationDialog(
                                      match.vulnerability.id
                                    )
                                  }
                                  className="flex items-center gap-1"
                                >
                                  <IconMessage className="h-4 w-4" />
                                  {classification ? "Edit" : "Classify"}
                                </Button>
                                {classification && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                      deleteClassification(
                                        match.vulnerability.id
                                      )
                                    }
                                    className="text-red-500 hover:text-red-700"
                                  >
                                    <IconX className="h-4 w-4" />
                                  </Button>
                                )}
                                <VulnerabilityUrlMenu
                                  vulnerabilityId={match.vulnerability.id}
                                  references={match.vulnerability.urls || []}
                                />
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Badge
                                  variant={
                                    getSeverityColor(
                                      match.vulnerability.severity
                                    ) as any
                                  }
                                >
                                  {match.vulnerability.severity}
                                </Badge>
                                {isMarkedFalsePositive && (
                                  <Badge variant="outline" className="text-xs">
                                    False Positive
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="font-medium">
                                    {match.vulnerability.id}
                                  </p>
                                  {comment && (
                                    <IconMessage
                                      className="h-4 w-4 text-muted-foreground"
                                      title={comment}
                                    />
                                  )}
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  {match.vulnerability.description?.slice(
                                    0,
                                    80
                                  )}
                                  ...
                                </p>
                                {comment && (
                                  <p className="text-xs text-blue-600 mt-1">
                                    💬 {comment.slice(0, 50)}
                                    {comment.length > 50 ? "..." : ""}
                                  </p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>{match.artifact.name}</TableCell>
                            <TableCell>{match.artifact.version}</TableCell>
                            <TableCell>
                              {match.vulnerability.fix?.versions?.[0] ? (
                                <Badge variant="default">
                                  {match.vulnerability.fix.versions[0]}
                                </Badge>
                              ) : (
                                <Badge variant="secondary">No fix</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Syft Results */}
          <TabsContent value="syft" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <IconPackage className="h-5 w-5" />
                  Syft SBOM Generator
                </CardTitle>
                <CardDescription>
                  Software Bill of Materials (SBOM) by Anchore
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <div className="text-center p-4 border rounded-lg">
                    <p className="text-2xl font-bold">
                      {syftResults?.artifacts?.length || 0}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Total Packages
                    </p>
                  </div>
                  <div className="text-center p-4 border rounded-lg">
                    <p className="text-2xl font-bold">
                      {syftResults?.artifacts
                        ? new Set(syftResults.artifacts.map((a) => a.type)).size
                        : 0}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Package Types
                    </p>
                  </div>
                  <div className="text-center p-4 border rounded-lg">
                    <p className="text-2xl font-bold">
                      {syftResults?.schema?.version || "N/A"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      SBOM Version
                    </p>
                  </div>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Package Name</TableHead>
                      <TableHead>Version</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Language</TableHead>
                      <TableHead>Locations</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(syftResults?.artifacts || [])
                      .slice(
                        (syftCurrentPage - 1) * syftItemsPerPage,
                        syftCurrentPage * syftItemsPerPage
                      )
                      .map((artifact, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-medium">
                            {artifact.name}
                          </TableCell>
                          <TableCell>{artifact.version}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{artifact.type}</Badge>
                          </TableCell>
                          <TableCell>{artifact.language || "N/A"}</TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground">
                              {artifact.locations?.length || 0} location(s)
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>

                {(syftResults?.artifacts?.length || 0) > syftItemsPerPage && (
                  <div className="flex items-center justify-between mt-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        Items per page:
                      </span>
                      <Select
                        value={syftItemsPerPage.toString()}
                        onValueChange={(value) => {
                          setSyftItemsPerPage(Number(value));
                          setSyftCurrentPage(1);
                        }}
                      >
                        <SelectTrigger className="w-20">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="10">10</SelectItem>
                          <SelectItem value="20">20</SelectItem>
                          <SelectItem value="50">50</SelectItem>
                          <SelectItem value="100">100</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-4">
                      <p className="text-sm text-muted-foreground">
                        Showing {(syftCurrentPage - 1) * syftItemsPerPage + 1}-
                        {Math.min(
                          syftCurrentPage * syftItemsPerPage,
                          syftResults?.artifacts?.length || 0
                        )}{" "}
                        of {syftResults?.artifacts?.length || 0} packages
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setSyftCurrentPage(Math.max(1, syftCurrentPage - 1))
                          }
                          disabled={syftCurrentPage === 1}
                        >
                          Previous
                        </Button>
                        <span className="text-sm">
                          Page {syftCurrentPage} of{" "}
                          {Math.ceil(
                            (syftResults?.artifacts?.length || 0) /
                              syftItemsPerPage
                          )}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setSyftCurrentPage(
                              Math.min(
                                Math.ceil(
                                  (syftResults?.artifacts?.length || 0) /
                                    syftItemsPerPage
                                ),
                                syftCurrentPage + 1
                              )
                            )
                          }
                          disabled={
                            syftCurrentPage >=
                            Math.ceil(
                              (syftResults?.artifacts?.length || 0) /
                                syftItemsPerPage
                            )
                          }
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Dockle Results */}
          <TabsContent value="dockle" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <IconSettings className="h-5 w-5" />
                  Dockle Configuration Linter
                </CardTitle>
                <CardDescription>
                  Container image linter for security and best practices
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Summary Statistics */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="text-center p-4 border rounded-lg">
                      <p className="text-2xl font-bold text-red-600">
                        {dockleResults?.summary?.fatal || 0}
                      </p>
                      <p className="text-sm text-muted-foreground">Fatal</p>
                    </div>
                    <div className="text-center p-4 border rounded-lg">
                      <p className="text-2xl font-bold text-orange-600">
                        {dockleResults?.summary?.warn || 0}
                      </p>
                      <p className="text-sm text-muted-foreground">Warnings</p>
                    </div>
                    <div className="text-center p-4 border rounded-lg">
                      <p className="text-2xl font-bold text-blue-600">
                        {dockleResults?.summary?.info || 0}
                      </p>
                      <p className="text-sm text-muted-foreground">Info</p>
                    </div>
                    <div className="text-center p-4 border rounded-lg">
                      <p className="text-2xl font-bold">
                        {dockleResults?.summary?.pass || 0}
                      </p>
                      <p className="text-sm text-muted-foreground">Passed</p>
                    </div>
                  </div>

                  <Separator />

                  {/* Search and Filter Bar */}
                  <div className="flex items-center gap-4">
                    <div className="relative flex-1">
                      <IconSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                      <Input
                        placeholder="Search rules, codes, or descriptions..."
                        value={dockleSearch}
                        onChange={(e) => setDockleSearch(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {filteredDockleFindings.length} of{" "}
                      {dockleResults?.details?.length || 0} findings
                    </div>
                  </div>

                  {/* Findings Table */}
                  <div className="border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>
                            <Button
                              variant="ghost"
                              className="h-auto p-0 font-medium"
                              onClick={() => handleDockleSort("level")}
                            >
                              Level
                              {dockleSortField === "level" &&
                                (dockleSortOrder === "asc" ? (
                                  <IconSortAscending className="ml-1 h-4 w-4" />
                                ) : (
                                  <IconSortDescending className="ml-1 h-4 w-4" />
                                ))}
                            </Button>
                          </TableHead>
                          <TableHead>
                            <Button
                              variant="ghost"
                              className="h-auto p-0 font-medium"
                              onClick={() => handleDockleSort("code")}
                            >
                              Rule Code
                              {dockleSortField === "code" &&
                                (dockleSortOrder === "asc" ? (
                                  <IconSortAscending className="ml-1 h-4 w-4" />
                                ) : (
                                  <IconSortDescending className="ml-1 h-4 w-4" />
                                ))}
                            </Button>
                          </TableHead>
                          <TableHead>
                            <Button
                              variant="ghost"
                              className="h-auto p-0 font-medium"
                              onClick={() => handleDockleSort("title")}
                            >
                              Title
                              {dockleSortField === "title" &&
                                (dockleSortOrder === "asc" ? (
                                  <IconSortAscending className="ml-1 h-4 w-4" />
                                ) : (
                                  <IconSortDescending className="ml-1 h-4 w-4" />
                                ))}
                            </Button>
                          </TableHead>
                          <TableHead>Details</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredDockleFindings.map((detail, index) => (
                          <TableRow key={index}>
                            <TableCell>
                              <Badge
                                variant={
                                  detail.level === "FATAL"
                                    ? "destructive"
                                    : detail.level === "WARN"
                                    ? "secondary"
                                    : "outline"
                                }
                              >
                                {detail.level}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <code className="text-sm bg-muted px-2 py-1 rounded">
                                {detail.code}
                              </code>
                            </TableCell>
                            <TableCell>
                              <p className="font-medium">{detail.title}</p>
                            </TableCell>
                            <TableCell>
                              <p className="text-sm text-muted-foreground max-w-md">
                                {detail.details}
                              </p>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* OSV Results */}
          {osvResults && (
            <TabsContent value="osv" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <IconPackage className="h-5 w-5" />
                    OSV Vulnerability Database
                  </CardTitle>
                  <CardDescription>
                    Open Source Vulnerability database analysis of container
                    packages
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* Summary Statistics */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                      <div className="text-center p-4 border rounded-lg">
                        <p className="text-2xl font-bold">
                          {osvResults.results?.reduce(
                            (total, result) =>
                              total + (result.packages?.length || 0),
                            0
                          ) || 0}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Total Packages
                        </p>
                      </div>
                      <div className="text-center p-4 border rounded-lg">
                        <p className="text-2xl font-bold text-red-600">
                          {osvResults.results?.reduce(
                            (total, result) =>
                              total +
                              (result.packages?.filter(
                                (pkg) => pkg.vulnerabilities.length > 0
                              ).length || 0),
                            0
                          ) || 0}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Vulnerable
                        </p>
                      </div>
                      <div className="text-center p-4 border rounded-lg">
                        <p className="text-2xl font-bold">
                          {new Set(
                            osvResults.results?.flatMap(
                              (result) =>
                                result.packages?.map(
                                  (pkg) => pkg.package.ecosystem
                                ) || []
                            )
                          ).size || 0}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Ecosystems
                        </p>
                      </div>
                    </div>

                    {/* Ecosystem Distribution */}
                    <div className="mb-6">
                      <h4 className="font-semibold mb-2">
                        Package Distribution by Ecosystem
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {Array.from(
                          new Set(
                            osvResults.results?.flatMap(
                              (result) =>
                                result.packages?.map(
                                  (pkg) => pkg.package.ecosystem
                                ) || []
                            )
                          )
                        ).map((ecosystem) => {
                          const count =
                            osvResults.results?.reduce(
                              (total, result) =>
                                total +
                                (result.packages?.filter(
                                  (pkg) => pkg.package.ecosystem === ecosystem
                                ).length || 0),
                              0
                            ) || 0;
                          return (
                            <Badge key={ecosystem} variant="outline">
                              {ecosystem}: {count}
                            </Badge>
                          );
                        })}
                      </div>
                    </div>

                    {/* Vulnerable Packages Table */}
                    <div>
                      <h4 className="font-semibold mb-4">
                        Vulnerable Packages
                      </h4>
                      <div className="border rounded-lg">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Package</TableHead>
                              <TableHead>Version</TableHead>
                              <TableHead>Ecosystem</TableHead>
                              <TableHead>Vulnerabilities</TableHead>
                              <TableHead>Severity</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {osvResults.results
                              ?.flatMap((result) => result.packages || [])
                              .filter((pkg) => pkg.vulnerabilities.length > 0)
                              .map((pkg, index) => {
                                const maxSeverity =
                                  pkg.groups?.[0]?.max_severity || "0";
                                const severityNum = parseFloat(maxSeverity);
                                return (
                                  <TableRow key={index}>
                                    <TableCell className="font-medium">
                                      {pkg.package.name}
                                    </TableCell>
                                    <TableCell>{pkg.package.version}</TableCell>
                                    <TableCell>
                                      <Badge variant="outline">
                                        {pkg.package.ecosystem}
                                      </Badge>
                                    </TableCell>
                                    <TableCell>
                                      {pkg.vulnerabilities.length}
                                    </TableCell>
                                    <TableCell>
                                      {severityNum >= 9 && (
                                        <Badge variant="destructive">
                                          Critical
                                        </Badge>
                                      )}
                                      {severityNum >= 7 && severityNum < 9 && (
                                        <Badge variant="destructive">
                                          High
                                        </Badge>
                                      )}
                                      {severityNum >= 4 && severityNum < 7 && (
                                        <Badge variant="secondary">
                                          Medium
                                        </Badge>
                                      )}
                                      {severityNum > 0 && severityNum < 4 && (
                                        <Badge variant="outline">Low</Badge>
                                      )}
                                      {severityNum === 0 && (
                                        <Badge variant="outline">Info</Badge>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                          </TableBody>
                        </Table>
                      </div>
                    </div>

                    {/* Show message if no vulnerable packages */}
                    {(osvResults.results
                      ?.flatMap((result) => result.packages || [])
                      .filter((pkg) => pkg.vulnerabilities.length > 0).length ||
                      0) === 0 && (
                      <div className="text-center py-8">
                        <IconInfoCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                        <p className="text-muted-foreground">
                          No vulnerable packages found
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* Dive Layer Analysis Results */}
          {diveResults?.layer && diveResults.layer.length > 0 && (
            <TabsContent value="dive" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Layer Analysis</CardTitle>
                  <CardDescription>
                    Docker image layer breakdown and file system analysis
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Tabs
                    value={selectedLayer}
                    onValueChange={setSelectedLayer}
                    className="w-full"
                  >
                    <TabsList className="flex w-full flex-wrap gap-1 h-auto p-1">
                      {diveResults.layer.map((layer, index) => (
                        <TabsTrigger
                          key={index}
                          value={index.toString()}
                          className="flex items-center gap-1 text-xs px-2 py-1.5 flex-shrink-0 min-w-fit"
                        >
                          <IconStack className="h-3 w-3" />
                          Layer {layer.index + 1}
                          <Badge variant="secondary" className="text-xs ml-1">
                            {(Number(layer.sizeBytes) / (1024 * 1024)).toFixed(1)}MB
                          </Badge>
                        </TabsTrigger>
                      ))}
                    </TabsList>

                    {diveResults.layer.map((layer, index) => (
                      <TabsContent
                        key={index}
                        value={index.toString()}
                        className="space-y-4"
                      >
                        <div className="border rounded-lg p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="font-mono">
                                Layer {layer.index + 1}
                              </Badge>
                              <span className="text-sm text-muted-foreground">
                                {(Number(layer.sizeBytes) / (1024 * 1024)).toFixed(2)}{" "}
                                MB
                              </span>
                            </div>
                            <Badge variant="secondary" className="text-xs">
                              {layer.fileList.length} files
                            </Badge>
                          </div>

                          <div className="mb-3">
                            <p className="text-sm font-medium mb-1">Command:</p>
                            <code className="text-xs bg-muted p-2 rounded block overflow-x-auto">
                              {layer.command}
                            </code>
                          </div>

                          <div className="mb-3">
                            <p className="text-sm font-medium mb-2">
                              Layer ID:
                            </p>
                            <code className="text-xs text-muted-foreground font-mono">
                              {layer.digestId}
                            </code>
                          </div>

                          {layer.fileList.length > 0 && (
                            <div>
                              <p className="text-sm font-medium mb-2">
                                Files ({layer.fileList.length}):
                              </p>
                              <div className="max-h-96 overflow-y-auto border rounded">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="border-b bg-muted/50">
                                      <th className="text-left p-2 font-medium">
                                        Path
                                      </th>
                                      <th className="text-left p-2 font-medium">
                                        Size
                                      </th>
                                      <th className="text-left p-2 font-medium">
                                        Mode
                                      </th>
                                      <th className="text-left p-2 font-medium">
                                        Owner
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {layer.fileList.map((file, fileIndex) => (
                                      <tr
                                        key={fileIndex}
                                        className="border-b hover:bg-muted/25"
                                      >
                                        <td className="p-2 font-mono">
                                          {file.path}
                                          {file.linkName && (
                                            <span className="text-muted-foreground ml-1">
                                              → {file.linkName}
                                            </span>
                                          )}
                                        </td>
                                        <td className="p-2">
                                          {file.size > 0
                                            ? `${(file.size / 1024).toFixed(
                                                1
                                              )}KB`
                                            : "-"}
                                        </td>
                                        <td className="p-2 font-mono">
                                          {file.fileMode.toString(8).slice(-4)}
                                        </td>
                                        <td className="p-2">
                                          {file.uid}:{file.gid}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </div>
                      </TabsContent>
                    ))}
                  </Tabs>
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
        )}
      </div>
      <CveClassificationDialog
        isOpen={classificationDialogOpen}
        onClose={handleCloseClassificationDialog}
        cveId={selectedCveId}
        imageId={scanData?.image?.id || ""} // Still pass for compatibility, but saveClassification handles image-name-wide logic
        currentClassification={getClassification(selectedCveId)}
        onSave={saveClassification}
      />
      
      {/* Vulnerability Details Modal */}
      <VulnerabilityDetailsModal
        vulnerability={selectedVulnerability}
        isOpen={isVulnModalOpen}
        onClose={() => {
          setIsVulnModalOpen(false);
          setSelectedVulnerability(null);
        }}
      />
    </div>
  );
}
