"use client";

import { useParams } from "next/navigation";
import { useEffect, useState, useMemo } from "react";
import { useDatabase } from "@/providers/DatabaseProvider";
import { useCveClassifications } from "@/hooks/useCveClassifications";
import { aggregateVulnerabilitiesWithClassifications } from "@/lib/scan-aggregations";
import {
  IconCalendarClock,
  IconShield,
  IconTag,
} from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { modalAction } from "@/lib/context-menu-utils";
import { UnifiedTable } from "@/components/table/unified-table";
import { ColumnDefinition, ContextMenuItem } from "@/components/table/types";
import { ImagePageSkeleton } from "@/components/image-loading";
import { toast } from "sonner";
import { IconDownload, IconUpload, IconTrash } from "@tabler/icons-react";
import { ExportImageDialogEnhanced } from "@/components/export-image-dialog-enhanced";

export default function ImageDetailsPage() {
  const params = useParams();
  const rawImageName = params.name as string;
  const imageName = decodeURIComponent(rawImageName); // Decode the URL-encoded name

  // State for export dialog
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportScanData, setExportScanData] = useState<{
    imageName: string;
    tag: string;
    scanId?: string;
    digest?: string;
  }>({ imageName: "", tag: "" });

  // Use DatabaseProvider instead of local state
  const {
    images,
    scans,
    imagesLoading,
    scansLoading,
    imagesError,
    scansError,
    refreshImages,
    refreshScans,
  } = useDatabase();

  // Filter data for the specific image name
  const imageData = useMemo(() => {
    const imagesByName = images.filter((img) => img.name === imageName);
    const scansForImages = scans.filter((scan) =>
      imagesByName.some((img) => img.id === scan.imageId)
    );

    if (imagesByName.length === 0) return null;

    const latestImage = imagesByName.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )[0];

    const tags = [...new Set(scansForImages.map((scan) => scan.tag).filter(Boolean))];

    // Get unique registries from all images
    const registries = [...new Set(imagesByName
      .map((img) => img.registry || img.registryType)
      .filter(Boolean)
    )];

    return {
      name: imageName,
      images: imagesByName,
      scans: scansForImages,
      latestImage,
      tags,
      registries,
      totalScans: scansForImages.length,
    };
  }, [images, scans, imageName]);

  const loading = imagesLoading || scansLoading;
  const error =
    imagesError ||
    scansError ||
    (imageData === null && !loading ? "No images found with this name" : null);

  // Legacy single-image classification hook (keeping for backward compatibility)
  const scanImageId =
    imageData?.scans?.[0]?.imageId || imageData?.latestImage?.id || "";
  const { classifications, loading: classificationsLoading } =
    useCveClassifications(scanImageId);

  // Consolidated classifications for the entire image name (all tags)
  const [consolidatedClassifications, setConsolidatedClassifications] =
    useState<any[]>([]);

  useEffect(() => {
    async function fetchConsolidatedClassifications() {
      if (!imageName || !imageData?.images) return;

      try {
        // Try the new consolidated endpoint first
        const response = await fetch(
          `/api/images/name/${encodeURIComponent(
            imageName
          )}/cve-classifications`
        );
        if (response.ok) {
          const consolidated = await response.json();
          console.log(
            `✅ Loaded ${consolidated.length} consolidated CVE classifications for ${imageName}`
          );
          setConsolidatedClassifications(consolidated);
          return;
        }

        // Fallback: fetch from individual images and consolidate client-side
        console.log("Using fallback: client-side consolidation");
        const imageIds = new Set<string>();

        // Add imageIds from scans and images
        imageData.scans?.forEach((scan: any) => {
          if (scan.imageId) imageIds.add(scan.imageId);
        });
        imageData.images?.forEach((img: any) => {
          if (img.id) imageIds.add(img.id);
        });

        // Fetch classifications for all imageIds and consolidate
        const allClassifications = new Map<string, any>();

        for (const imageId of imageIds) {
          try {
            const response = await fetch(
              `/api/images/${imageId}/cve-classifications`
            );
            if (response.ok) {
              const classifications = await response.json();
              classifications.forEach((classification: any) => {
                // Use CVE ID as key to avoid duplicates across tags
                const existing = allClassifications.get(classification.cveId);
                if (
                  !existing ||
                  new Date(classification.updatedAt) >
                    new Date(existing.updatedAt)
                ) {
                  allClassifications.set(classification.cveId, classification);
                }
              });
            }
          } catch (error) {
            console.error(
              `Failed to fetch classifications for ${imageId}:`,
              error
            );
          }
        }

        const consolidated = Array.from(allClassifications.values());
        console.log(
          `✅ Fallback: Consolidated ${consolidated.length} CVE classifications for ${imageName}`
        );
        setConsolidatedClassifications(consolidated);
      } catch (error) {
        console.error("Error fetching consolidated classifications:", error);
      }
    }

    fetchConsolidatedClassifications();
  }, [imageName]); // Only depend on imageName to prevent imageData refresh loops

  // Refresh data when component mounts
  useEffect(() => {
    refreshImages();
    refreshScans();
  }, []); // Remove dependencies to prevent infinite loop

  if (loading || (imageData && classificationsLoading)) {
    return (
      <div className="flex-1 overflow-auto">
        <ImagePageSkeleton />
      </div>
    );
  }

  if (error || !imageData) {
    const breadcrumbs = [
      { label: "Dashboard", href: "/" },
      { label: imageName },
    ];

    return (
      <div className="flex-1 overflow-auto">
        <div className="@container/main flex flex-col gap-4 p-4 lg:p-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-500">
                <IconShield className="h-5 w-5" />
                Image Not Found
              </CardTitle>
              <CardDescription>
                {error || "The requested image could not be found"}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4 py-8">
              <p className="text-muted-foreground text-center">
                The image "{imageName}" does not exist or may have been removed.
              </p>
              <Button asChild>
                <a href="/">Go Back to Dashboard</a>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Helper function to get adjusted vulnerability counts for a scan
  const getAdjustedVulnerabilityCount = (scan: any) => {
    // Use consolidated classifications that apply across all tags of this image
    console.log(
      `🔍 Scan ${scan.id.slice(-6)}: Using ${
        consolidatedClassifications.length
      } classifications (${
        consolidatedClassifications.filter((c) => c.isFalsePositive).length
      } false positives)`
    );

    // If no classifications, return original counts
    if (
      !consolidatedClassifications ||
      consolidatedClassifications.length === 0
    ) {
      return scan.vulnerabilityCount
        ? {
            critical: scan.vulnerabilityCount.critical || 0,
            high: scan.vulnerabilityCount.high || 0,
            medium: scan.vulnerabilityCount.medium || 0,
            low: scan.vulnerabilityCount.low || 0,
          }
        : { critical: 0, high: 0, medium: 0, low: 0 };
    }

    // If we have scanner reports, use the classification-aware calculation
    if (scan.trivy || scan.grype) {
      const adjustedCounts = aggregateVulnerabilitiesWithClassifications(
        {
          ...scan,
          scannerReports: {
            trivy: scan.trivy,
            grype: scan.grype,
          },
        },
        consolidatedClassifications
      );

      console.log(
        `✅ Adjusted vulnerabilities: Critical ${
          scan.vulnerabilityCount?.critical || 0
        } → ${adjustedCounts.critical}, High ${
          scan.vulnerabilityCount?.high || 0
        } → ${adjustedCounts.high}`
      );

      return {
        critical: adjustedCounts.critical,
        high: adjustedCounts.high,
        medium: adjustedCounts.medium,
        low: adjustedCounts.low,
      };
    }

    // Fallback to original counts if no scanner reports
    return {
      critical: scan.vulnerabilityCount?.critical || 0,
      high: scan.vulnerabilityCount?.high || 0,
      medium: scan.vulnerabilityCount?.medium || 0,
      low: scan.vulnerabilityCount?.low || 0,
    };
  };

  // Transform scans to historical scans format (now includes all tags)
  const historicalScans =
    imageData.scans
      ?.map((scan: any, index: number) => {
        // Add safety checks for scan properties
        if (!scan || !scan.id || !scan.image) {
          console.warn("Invalid scan data:", scan);
          return null;
        }

        // Find the corresponding image to get registry info
        const matchingImage = imageData.images.find(img => img.id === scan.imageId);
        const registryInfo = matchingImage?.registry || matchingImage?.registryType ||
                            scan.image?.registry || scan.image?.registryType || 'Unknown';

        return {
          id: Math.abs(
            scan.id
              .split("")
              .reduce(
                (a: number, b: string) => ((a << 5) - a + b.charCodeAt(0)) | 0,
                0
              )
          ),
          scanId: scan.id, // Real scan ID for navigation
          scanDate: scan.startedAt,
          version: `${scan.image?.name || imageName}:${scan.tag || 'latest'}`, // Show specific tag for each scan
          registry: registryInfo, // Include registry information from image
          source: scan.source || 'registry', // Include scan source
          riskScore: scan.riskScore || 0,
          severities: (() => {
            const adjustedCounts = getAdjustedVulnerabilityCount(scan);
            return {
              crit: adjustedCounts.critical,
              high: adjustedCounts.high,
              med: adjustedCounts.medium,
              low: adjustedCounts.low,
            };
          })(),
          fixable: {
            count: 0, // TODO: Calculate from scan data
            percent: 0,
          },
          status: scan.status === "SUCCESS" ? "Complete" : scan.status,
          scanDuration: scan.finishedAt
            ? `${Math.round(
                (new Date(scan.finishedAt).getTime() -
                  new Date(scan.startedAt).getTime()) /
                  1000
              )}s`
            : "Running",
          newVulns: 0, // TODO: Calculate delta
          resolvedVulns: 0,
          misconfigs: 0, // TODO: Extract from dockle data
          secrets: 0, // TODO: Extract from trivy data
          compliance: {
            dockle: scan.dockleGrade || scan.complianceScore?.dockle?.grade || "N/A",
          },
          dbVersion: "1.0", // TODO: Get from scan metadata
          scanEngine: "Multi-tool", // TODO: Get from scannerVersions
        };
      })
      .filter(Boolean) || [];

  const breadcrumbs = [
    { label: "Dashboard", href: "/" },
    { label: imageData.name },
  ];

  return (
    <div className="flex-1 overflow-auto">
      <div className="@container/main flex flex-col gap-4 p-4 lg:p-6">
        {/* Image Metadata Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <IconTag className="h-5 w-5" />
                Image Information
              </CardTitle>
              <CardDescription>
                Container image details and metadata
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Image Name
                  </p>
                  <p className="font-mono text-sm">{imageData.name}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Available Tags
                  </p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {imageData.tags?.map((tag: string, index: number) => (
                      <Badge key={`${tag}-${index}`} variant="outline" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Latest Tag
                  </p>
                  <Badge variant="outline">{imageData.latestImage?.tag}</Badge>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Platform
                  </p>
                  <Badge variant="outline">
                    {imageData.latestImage?.platform || "Unknown"}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Size (Latest)
                  </p>
                  <p className="text-sm">
                    {imageData.latestImage?.sizeBytes
                      ? Math.round(
                          Number(imageData.latestImage.sizeBytes || 0) / 1024 / 1024
                        )
                      : 0}{" "}
                    MB
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Registry
                  </p>
                  <p className="text-sm">
                    {imageData.registries?.length > 0
                      ? imageData.registries.join(", ")
                      : "Docker Hub"}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Total Scans
                  </p>
                  <p className="text-sm">{imageData.totalScans}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Latest Digest
                  </p>
                  <p className="font-mono text-sm text-xs">
                    {imageData.latestImage?.digest?.slice(7, 19) || "N/A"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Summary Statistics */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <IconShield className="h-5 w-5" />
                Security Summary
              </CardTitle>
              <CardDescription>Across all tags and scans</CardDescription>
            </CardHeader>
            <CardContent>
              {historicalScans.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm">Latest Risk Score</span>
                    <Badge
                      variant={
                        historicalScans[0]?.riskScore > 75
                          ? "destructive"
                          : historicalScans[0]?.riskScore > 50
                          ? "default"
                          : "secondary"
                      }
                    >
                      {historicalScans[0]?.riskScore}/100
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">Critical Vulns</span>
                    <span className="text-sm font-medium text-red-600">
                      {historicalScans[0]?.severities?.crit || 0}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm">High Vulns</span>
                    <span className="text-sm font-medium text-orange-600">
                      {historicalScans[0]?.severities?.high || 0}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No scan data available
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Historical Scans */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconCalendarClock className="h-5 w-5" />
              All Scans Across Tags
            </CardTitle>
            <CardDescription>
              Security scans for all versions of {imageData.name}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <UnifiedTable
              data={historicalScans.filter(Boolean) as any}
              columns={getHistoricalScansColumns()}
              features={{
                sorting: true,
                filtering: false,
                pagination: true,
                contextMenu: true,
              }}
              onRowClick={handleScanClick}
              contextMenuItems={getScanContextMenuItems}
            />
          </CardContent>
        </Card>
      </div>

      {/* Export Dialog */}
      <ExportImageDialogEnhanced
        open={exportDialogOpen}
        onOpenChange={(open) => {
          setExportDialogOpen(open);
          if (!open) {
            setExportScanData({ imageName: "", tag: "", scanId: undefined, digest: undefined });
          }
        }}
        imageName={exportScanData.imageName}
        imageTag={exportScanData.tag}
        scanId={exportScanData.scanId}
        digest={exportScanData.digest}
        patchedTarPath=""
        patchOperationId=""
      />
    </div>
  );

  // Table column definitions
  function getHistoricalScansColumns(): ColumnDefinition<any>[] {
    return [
      {
        key: 'scanDate',
        header: 'Scan Date',
        type: 'scan-date',
        sortable: true,
      },
      {
        key: 'version',
        header: 'Version',
        type: 'badge',
      },
      {
        key: 'registry',
        header: 'Registry',
        type: 'registry',
      },
      {
        key: 'riskScore',
        header: 'Risk Score',
        type: 'badge',
        sortable: true,
      },
      {
        key: 'severities',
        header: 'Findings',
        type: 'toggle-group',
      },
      {
        key: 'compliance.dockle',
        header: 'Compliance',
        type: 'badge',
        accessorFn: (row: any) => row.compliance?.dockle || 'N/A',
      },
      {
        key: 'scanDuration',
        header: 'Duration',
        type: 'duration',
      },
    ];
  }

  // Handle scan row click
  function handleScanClick(row: any) {
    if (imageData?.name && row.scanId) {
      window.location.href = `/images/${encodeURIComponent(imageData.name)}/${row.scanId}`;
    }
  }

  // Context menu items for scans
  function getScanContextMenuItems(row: any): ContextMenuItem<any>[] {
    return [
      {
        label: 'Download Reports',
        icon: <IconDownload className="mr-2 h-4 w-4" />,
        action: async () => {
          if (!imageData?.name || !row.scanId) return;

          try {
            const response = await fetch(`/api/image/${encodeURIComponent(imageData.name)}/scan/${row.scanId}/download`);
            if (!response.ok) throw new Error('Download failed');

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${imageData.name.replace('/', '_')}_${row.scanId}_reports.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
          } catch (error) {
            toast.error('Failed to download scan reports');
          }
        },
      },
      {
        label: 'Export Image',
        icon: <IconUpload className="mr-2 h-4 w-4" />,
        action: modalAction(() => {
          // row.version contains "imageName:tag", need to extract just the tag
          const versionParts = (row.version || 'latest').split(':');
          const extractedTag = versionParts.length > 1 ? versionParts[versionParts.length - 1] : versionParts[0];

          // Ensure we're using the base image name without any tags
          const baseImageName = (imageData?.name || imageName).split(':')[0];

          // Get the scan details to find the digest
          const scan = imageData?.scans?.find((s: any) => s.id === row.scanId);
          const matchingImage = imageData?.images?.find((img: any) => img.id === scan?.imageId);

          setExportScanData({
            imageName: baseImageName,
            tag: extractedTag,  // Just the tag part, not the full version string
            scanId: row.scanId,
            digest: matchingImage?.digest
          });
          setExportDialogOpen(true);
        }),
      },
      {
        label: 'Delete Scan',
        separator: true,
        icon: <IconTrash className="mr-2 h-4 w-4" />,
        action: async () => {
          if (!row.scanId) return;

          if (confirm('Are you sure you want to delete this scan?')) {
            try {
              const response = await fetch(`/api/scans/${row.scanId}`, {
                method: 'DELETE',
              });

              if (!response.ok) throw new Error('Failed to delete scan');

              toast.success('Scan deleted successfully');
              refreshScans();
              setTimeout(() => window.location.reload(), 500);
            } catch (error) {
              toast.error('Failed to delete scan');
            }
          }
        },
        variant: 'destructive',
      },
    ];
  }
}
