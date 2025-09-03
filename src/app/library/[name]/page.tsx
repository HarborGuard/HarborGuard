"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  IconPackage,
  IconBug,
  IconShield,
  IconExternalLink,
  IconSearch,
  IconSortAscending,
  IconSortDescending,
} from "@tabler/icons-react";

import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { VulnerabilityUrlMenu } from "@/components/vulnerability-url-menu";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { useScans } from "@/hooks/useScans";

interface LibraryVulnerability {
  id: string;
  severity: string;
  description: string;
  installedVersion: string;
  fixedVersion?: string;
  cvss?: number;
  scanId: string;
  imageName: string;
  imageTag: string;
  references: string[];
}

export default function LibraryDetailsPage() {
  const params = useParams();
  const libraryName = decodeURIComponent(params.name as string);
  const { scans, loading } = useScans();

  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<string>("severity");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const vulnerabilities = React.useMemo(() => {
    if (!scans || scans.length === 0) return [];

    const vulnMap = new Map<string, LibraryVulnerability>(); // CVE ID -> vulnerability (unique)
    const imageMap = new Map<string, Set<string>>(); // CVE ID -> Set of image names

    scans.forEach((scan) => {
      const imageName = scan.imageName || scan.image.split(":")[0] || "unknown";
      const imageTag = scan.image.split(":")[1] || "latest";
      const fullImageName = `${imageName}:${imageTag}`;

      // Process Trivy results
      const trivyResults = scan.scannerReports?.trivy;
      if (trivyResults?.Results) {
        trivyResults.Results.forEach((result) => {
          result.Vulnerabilities?.forEach((vuln) => {
            if (vuln.PkgName === libraryName && vuln.VulnerabilityID) {
              const cveId = vuln.VulnerabilityID;

              // Track unique images per CVE
              if (!imageMap.has(cveId)) {
                imageMap.set(cveId, new Set());
              }
              imageMap.get(cveId)!.add(fullImageName);

              // Only store each CVE once (keep the one with highest severity or most complete data)
              if (!vulnMap.has(cveId)) {
                vulnMap.set(cveId, {
                  id: cveId,
                  severity: vuln.Severity,
                  description: vuln.Description || vuln.Title || "",
                  installedVersion: vuln.InstalledVersion,
                  fixedVersion: vuln.FixedVersion,
                  cvss: vuln.CVSS?.nvd?.V3Score || vuln.CVSS?.redhat?.V3Score,
                  scanId: scan.id.toString(),
                  imageName: imageName,
                  imageTag: imageTag,
                  references: vuln.References || [],
                });
              } else {
                // Update with higher severity or better CVSS score if available
                const existing = vulnMap.get(cveId)!;
                const newCvss =
                  vuln.CVSS?.nvd?.V3Score || vuln.CVSS?.redhat?.V3Score;
                if (newCvss && (!existing.cvss || newCvss > existing.cvss)) {
                  existing.cvss = newCvss;
                }
                // Update description if existing one is empty
                if (!existing.description && (vuln.Description || vuln.Title)) {
                  existing.description = vuln.Description || vuln.Title || "";
                }
                // Update fixed version if not set
                if (!existing.fixedVersion && vuln.FixedVersion) {
                  existing.fixedVersion = vuln.FixedVersion;
                }
              }
            }
          });
        });
      }

      // Also process Grype results (combine with Trivy)
      const grypeResults = scan.scannerReports?.grype;
      if (grypeResults?.matches) {
        grypeResults.matches.forEach((match) => {
          if (match.artifact.name === libraryName && match.vulnerability.id) {
            const cveId = match.vulnerability.id;

            // Track unique images per CVE
            if (!imageMap.has(cveId)) {
              imageMap.set(cveId, new Set());
            }
            imageMap.get(cveId)!.add(fullImageName);

            // Store or update with highest severity
            if (!vulnMap.has(cveId)) {
              vulnMap.set(cveId, {
                id: cveId,
                severity:
                  match.vulnerability.severity?.toUpperCase() || "UNKNOWN",
                description: match.vulnerability.description || "",
                installedVersion: match.artifact.version,
                fixedVersion: match.vulnerability.fix?.versions?.[0],
                cvss: match.vulnerability.cvss?.[0]?.metrics?.baseScore,
                scanId: scan.id.toString(),
                imageName: imageName,
                imageTag: imageTag,
                references: match.vulnerability.urls || [],
              });
            } else {
              // Update if Grype has higher severity or additional info
              const existing = vulnMap.get(cveId)!;
              const grypeSevertiy = match.vulnerability.severity?.toUpperCase() || "UNKNOWN";
              
              // Helper to get severity priority
              const getSeverityPriority = (sev: string) => {
                const priorities: Record<string, number> = {
                  CRITICAL: 5,
                  HIGH: 4,
                  MEDIUM: 3,
                  LOW: 2,
                  INFO: 1,
                  UNKNOWN: 0
                };
                return priorities[sev] || 0;
              };
              
              // Update to highest severity
              if (getSeverityPriority(grypeSevertiy) > getSeverityPriority(existing.severity)) {
                existing.severity = grypeSevertiy;
              }
              
              // Update other fields if missing
              if (!existing.description && match.vulnerability.description) {
                existing.description = match.vulnerability.description;
              }
              if (!existing.fixedVersion && match.vulnerability.fix?.versions?.[0]) {
                existing.fixedVersion = match.vulnerability.fix.versions[0];
              }
              const grypeCvss = match.vulnerability.cvss?.[0]?.metrics?.baseScore;
              if (grypeCvss && (!existing.cvss || grypeCvss > existing.cvss)) {
                existing.cvss = grypeCvss;
              }
            }
          }
        });
      }
    });

    // Convert to array and add aggregated image information
    const uniqueVulns = Array.from(vulnMap.values()).map((vuln) => {
      const affectedImages = imageMap.get(vuln.id);
      const imageCount = affectedImages ? affectedImages.size : 1;
      const imageList = affectedImages
        ? Array.from(affectedImages).join(", ")
        : `${vuln.imageName}:${vuln.imageTag}`;

      return {
        ...vuln,
        // Override imageName/imageTag with aggregated info when multiple images are affected
        imageName: imageCount > 1 ? `${imageCount} images` : vuln.imageName,
        imageTag: imageCount > 1 ? `(${imageList})` : vuln.imageTag,
      };
    });

    return uniqueVulns;
  }, [scans, libraryName]);

  const filteredVulnerabilities = React.useMemo(() => {
    let filtered = vulnerabilities.filter(
      (vuln) =>
        vuln.id.toLowerCase().includes(search.toLowerCase()) ||
        vuln.description.toLowerCase().includes(search.toLowerCase()) ||
        vuln.severity.toLowerCase().includes(search.toLowerCase()) ||
        vuln.imageName.toLowerCase().includes(search.toLowerCase())
    );

    return filtered.sort((a, b) => {
      let aValue: any, bValue: any;

      switch (sortField) {
        case "severity":
          const severityWeight = (s: string) => {
            switch (s.toLowerCase()) {
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
          aValue = severityWeight(a.severity);
          bValue = severityWeight(b.severity);
          break;
        case "cvss":
          aValue = a.cvss || 0;
          bValue = b.cvss || 0;
          break;
        case "id":
          aValue = a.id;
          bValue = b.id;
          break;
        case "image":
          aValue = `${a.imageName}:${a.imageTag}`;
          bValue = `${b.imageName}:${b.imageTag}`;
          break;
        default:
          return 0;
      }

      if (sortOrder === "asc") {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });
  }, [vulnerabilities, search, sortField, sortOrder]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
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

  const breadcrumbs = [
    { label: "Dashboard", href: "/" },
    { label: "Library", href: "/library" },
    { label: libraryName },
  ];

  // Calculate statistics from the vulnerability data
  const stats = React.useMemo(() => {
    if (!scans || scans.length === 0)
      return {
        total: 0,
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        affectedImages: 0,
        fixableCount: 0,
        fixablePercent: 0,
      };

    const severityCounts = vulnerabilities.reduce((acc, vuln) => {
      const severity = vuln.severity.toLowerCase();
      acc[severity] = (acc[severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Calculate unique affected images from original scan data
    const affectedImagesSet = new Set<string>();
    scans.forEach((scan) => {
      const imageName = scan.imageName || scan.image.split(":")[0] || "unknown";
      const imageTag = scan.image.split(":")[1] || "latest";
      const fullImageName = `${imageName}:${imageTag}`;

      // Check if this scan contains the library we're looking at
      const trivyResults = scan.scannerReports?.trivy;
      if (trivyResults?.Results) {
        const hasLibrary = trivyResults.Results.some((result) =>
          result.Vulnerabilities?.some((vuln) => vuln.PkgName === libraryName)
        );
        if (hasLibrary) {
          affectedImagesSet.add(fullImageName);
        }
        return;
      }

      const grypeResults = scan.scannerReports?.grype;
      if (grypeResults?.matches) {
        const hasLibrary = grypeResults.matches.some(
          (match) => match.artifact.name === libraryName
        );
        if (hasLibrary) {
          affectedImagesSet.add(fullImageName);
        }
      }
    });

    const fixableCount = vulnerabilities.filter((v) => v.fixedVersion).length;

    return {
      total: vulnerabilities.length,
      critical: severityCounts.critical || 0,
      high: severityCounts.high || 0,
      medium: severityCounts.medium || 0,
      low: severityCounts.low || 0,
      affectedImages: affectedImagesSet.size,
      fixableCount,
      fixablePercent:
        vulnerabilities.length > 0
          ? Math.round((fixableCount / vulnerabilities.length) * 100)
          : 0,
    };
  }, [vulnerabilities, scans, libraryName]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        Loading library data...
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-2 overflow-auto">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
          {/* Library Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <IconPackage className="h-5 w-5" />
                {libraryName}
              </CardTitle>
              <CardDescription>
                Security analysis for library across all scanned images
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                <div className="text-center">
                  <p className="text-2xl font-bold">{stats.total}</p>
                  <p className="text-sm text-muted-foreground">Total CVEs</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-red-600">
                    {stats.critical}
                  </p>
                  <p className="text-sm text-muted-foreground">Critical</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-orange-600">
                    {stats.high}
                  </p>
                  <p className="text-sm text-muted-foreground">High</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-yellow-600">
                    {stats.medium}
                  </p>
                  <p className="text-sm text-muted-foreground">Medium</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-blue-600">
                    {stats.low}
                  </p>
                  <p className="text-sm text-muted-foreground">Low</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold">{stats.affectedImages}</p>
                  <p className="text-sm text-muted-foreground">Images</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-600">
                    {stats.fixablePercent}%
                  </p>
                  <p className="text-sm text-muted-foreground">Fixable</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Vulnerabilities Table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <IconBug className="h-5 w-5" />
                Vulnerabilities
              </CardTitle>
              <CardDescription>
                All vulnerabilities found in {libraryName} across scanned images
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Search Bar */}
                <div className="flex items-center gap-4">
                  <div className="relative flex-1">
                    <IconSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                    <Input
                      placeholder="Search vulnerabilities, CVEs, or images..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {filteredVulnerabilities.length} of {vulnerabilities.length}{" "}
                    vulnerabilities
                  </div>
                </div>

                {/* Table */}
                <div className="border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>
                          <Button
                            variant="ghost"
                            className="h-auto p-0 font-medium"
                            onClick={() => handleSort("severity")}
                          >
                            Severity
                            {sortField === "severity" &&
                              (sortOrder === "asc" ? (
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
                            onClick={() => handleSort("id")}
                          >
                            CVE ID
                            {sortField === "id" &&
                              (sortOrder === "asc" ? (
                                <IconSortAscending className="ml-1 h-4 w-4" />
                              ) : (
                                <IconSortDescending className="ml-1 h-4 w-4" />
                              ))}
                          </Button>
                        </TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>
                          <Button
                            variant="ghost"
                            className="h-auto p-0 font-medium"
                            onClick={() => handleSort("cvss")}
                          >
                            CVSS Score
                            {sortField === "cvss" &&
                              (sortOrder === "asc" ? (
                                <IconSortAscending className="ml-1 h-4 w-4" />
                              ) : (
                                <IconSortDescending className="ml-1 h-4 w-4" />
                              ))}
                          </Button>
                        </TableHead>
                        <TableHead>Versions</TableHead>
                        <TableHead>
                          <Button
                            variant="ghost"
                            className="h-auto p-0 font-medium"
                            onClick={() => handleSort("image")}
                          >
                            Found In
                            {sortField === "image" &&
                              (sortOrder === "asc" ? (
                                <IconSortAscending className="ml-1 h-4 w-4" />
                              ) : (
                                <IconSortDescending className="ml-1 h-4 w-4" />
                              ))}
                          </Button>
                        </TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredVulnerabilities.map((vuln, index) => (
                        <TableRow key={`${vuln.id}-${vuln.scanId}-${index}`}>
                          <TableCell>
                            <Badge
                              variant={getSeverityColor(vuln.severity) as any}
                            >
                              {vuln.severity}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <p className="font-medium font-mono text-sm">
                              {vuln.id}
                            </p>
                          </TableCell>
                          <TableCell>
                            <p
                              className="text-sm max-w-md truncate"
                              title={vuln.description}
                            >
                              {vuln.description || "No description available"}
                            </p>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {vuln.cvss ? vuln.cvss.toFixed(1) : "N/A"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <p className="text-sm">
                                <span className="font-medium">Installed:</span>{" "}
                                {vuln.installedVersion}
                              </p>
                              {vuln.fixedVersion ? (
                                <p className="text-sm">
                                  <span className="font-medium">Fixed:</span>{" "}
                                  {vuln.fixedVersion}
                                </p>
                              ) : (
                                <Badge variant="secondary" className="text-xs">
                                  No fix available
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {vuln.imageName}:{vuln.imageTag}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <VulnerabilityUrlMenu
                              vulnerabilityId={vuln.id}
                              references={vuln.references || []}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {filteredVulnerabilities.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    {search
                      ? `No vulnerabilities found matching "${search}"`
                      : `No vulnerabilities found for ${libraryName}`}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
