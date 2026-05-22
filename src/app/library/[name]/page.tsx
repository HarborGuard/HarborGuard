"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Package,
  Bug,
  Shield,
  ExternalLink,
  Search,
  ArrowUpAZ,
  ArrowDownAZ,
} from "lucide-react";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { SiteHeader } from "@/components/layout/site-header";
import { Button } from "@/components/ui/button";
import { VulnerabilityUrlMenu } from "@/components/shared/vulnerability-url-menu";
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
import { getSeverityBadgeVariant, getSeverityWeight } from "@/lib/utils/severity-utils";
import { getImageName, getImageTag } from "@/lib/utils/image-utils";

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
      // Handle both string and object formats for scan.image
      const imageName = scan.imageName ||
        (typeof scan.image === 'string'
          ? getImageName(scan.image)
          : (scan.image as any)?.name) || "unknown";
      const imageTag = typeof scan.image === 'string'
        ? getImageTag(scan.image)
        : (scan.image as any)?.tag || "latest";
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
              
              // Update to highest severity
              if (getSeverityWeight(grypeSevertiy) > getSeverityWeight(existing.severity)) {
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
          aValue = getSeverityWeight(a.severity);
          bValue = getSeverityWeight(b.severity);
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
      // Handle both string and object formats for scan.image
      const imageName = scan.imageName ||
        (typeof scan.image === 'string'
          ? getImageName(scan.image)
          : (scan.image as any)?.name) || "unknown";
      const imageTag = typeof scan.image === 'string'
        ? getImageTag(scan.image)
        : (scan.image as any)?.tag || "latest";
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
      <div className="flex items-center justify-center h-screen text-caption uppercase tracking-widest text-muted-foreground/40">
        Loading library data...
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-2 overflow-auto">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
          {/* Library Overview */}
          <Card className="bg-surface-1 border-white/10 rounded-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-body-sm uppercase tracking-caps text-foreground">
                <Package className="h-4 w-4 text-accent" />
                {libraryName}
              </CardTitle>
              <CardDescription className="text-caption uppercase tracking-widest text-muted-foreground/50">
                Security analysis for library across all scanned images
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                <div className="text-center">
                  <p className="text-2xl tracking-tight text-foreground">{stats.total}</p>
                  <p className="text-caption uppercase tracking-widest text-muted-foreground/50">Total CVEs</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl tracking-tight text-red-400">
                    {stats.critical}
                  </p>
                  <p className="text-caption uppercase tracking-widest text-muted-foreground/50">Critical</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl tracking-tight text-orange-400">
                    {stats.high}
                  </p>
                  <p className="text-caption uppercase tracking-widest text-muted-foreground/50">High</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl tracking-tight text-yellow-400">
                    {stats.medium}
                  </p>
                  <p className="text-caption uppercase tracking-widest text-muted-foreground/50">Medium</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl tracking-tight text-blue-400">
                    {stats.low}
                  </p>
                  <p className="text-caption uppercase tracking-widest text-muted-foreground/50">Low</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl tracking-tight text-foreground">{stats.affectedImages}</p>
                  <p className="text-caption uppercase tracking-widest text-muted-foreground/50">Images</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl tracking-tight text-green-400">
                    {stats.fixablePercent}%
                  </p>
                  <p className="text-caption uppercase tracking-widest text-muted-foreground/50">Fixable</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Vulnerabilities Table */}
          <Card className="bg-surface-1 border-white/10 rounded-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-body-sm uppercase tracking-caps text-foreground">
                <Bug className="h-4 w-4 text-accent" />
                Vulnerabilities
              </CardTitle>
              <CardDescription className="text-caption uppercase tracking-widest text-muted-foreground/50">
                All vulnerabilities found in {libraryName} across scanned images
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Search Bar */}
                <div className="flex items-center gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground/40 h-4 w-4" />
                    <Input
                      placeholder="Search vulnerabilities, CVEs, or images..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-10 rounded-none border-white/10 bg-transparent text-body-sm placeholder:text-muted-foreground/30 placeholder:tracking-caps placeholder:uppercase"
                    />
                  </div>
                  <div className="text-caption uppercase tracking-widest text-muted-foreground/50">
                    {filteredVulnerabilities.length} of {vulnerabilities.length}{" "}
                    vulnerabilities
                  </div>
                </div>

                {/* Table */}
                <div className="border border-white/10 overflow-hidden rounded-none">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-white/10 hover:bg-transparent">
                        <TableHead className="uppercase tracking-widest text-caption text-muted-foreground/60 bg-surface-1">
                          <Button
                            variant="ghost"
                            className="h-auto p-0 text-caption uppercase tracking-widest hover:bg-transparent hover:text-foreground"
                            onClick={() => handleSort("severity")}
                          >
                            Severity
                            {sortField === "severity" &&
                              (sortOrder === "asc" ? (
                                <ArrowUpAZ className="ml-1 h-4 w-4" />
                              ) : (
                                <ArrowDownAZ className="ml-1 h-4 w-4" />
                              ))}
                          </Button>
                        </TableHead>
                        <TableHead className="uppercase tracking-widest text-caption text-muted-foreground/60 bg-surface-1">
                          <Button
                            variant="ghost"
                            className="h-auto p-0 text-caption uppercase tracking-widest hover:bg-transparent hover:text-foreground"
                            onClick={() => handleSort("id")}
                          >
                            CVE ID
                            {sortField === "id" &&
                              (sortOrder === "asc" ? (
                                <ArrowUpAZ className="ml-1 h-4 w-4" />
                              ) : (
                                <ArrowDownAZ className="ml-1 h-4 w-4" />
                              ))}
                          </Button>
                        </TableHead>
                        <TableHead className="uppercase tracking-widest text-caption text-muted-foreground/60 bg-surface-1">Description</TableHead>
                        <TableHead className="uppercase tracking-widest text-caption text-muted-foreground/60 bg-surface-1">
                          <Button
                            variant="ghost"
                            className="h-auto p-0 text-caption uppercase tracking-widest hover:bg-transparent hover:text-foreground"
                            onClick={() => handleSort("cvss")}
                          >
                            CVSS Score
                            {sortField === "cvss" &&
                              (sortOrder === "asc" ? (
                                <ArrowUpAZ className="ml-1 h-4 w-4" />
                              ) : (
                                <ArrowDownAZ className="ml-1 h-4 w-4" />
                              ))}
                          </Button>
                        </TableHead>
                        <TableHead className="uppercase tracking-widest text-caption text-muted-foreground/60 bg-surface-1">Versions</TableHead>
                        <TableHead className="uppercase tracking-widest text-caption text-muted-foreground/60 bg-surface-1">
                          <Button
                            variant="ghost"
                            className="h-auto p-0 text-caption uppercase tracking-widest hover:bg-transparent hover:text-foreground"
                            onClick={() => handleSort("image")}
                          >
                            Found In
                            {sortField === "image" &&
                              (sortOrder === "asc" ? (
                                <ArrowUpAZ className="ml-1 h-4 w-4" />
                              ) : (
                                <ArrowDownAZ className="ml-1 h-4 w-4" />
                              ))}
                          </Button>
                        </TableHead>
                        <TableHead className="uppercase tracking-widest text-caption text-muted-foreground/60 bg-surface-1">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredVulnerabilities.map((vuln, index) => (
                        <TableRow key={`${vuln.id}-${vuln.scanId}-${index}`} className="border-white/10 hover:bg-white/5">
                          <TableCell>
                            <Badge
                              variant={getSeverityBadgeVariant(vuln.severity) as any}
                              className="rounded-none uppercase tracking-widest text-caption"
                            >
                              {vuln.severity}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <p className="font-mono text-body-sm text-foreground uppercase">
                              {vuln.id}
                            </p>
                          </TableCell>
                          <TableCell>
                            <p
                              className="text-body-sm max-w-md truncate text-muted-foreground"
                              title={vuln.description}
                            >
                              {vuln.description || "No description available"}
                            </p>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="rounded-none uppercase tracking-widest text-caption border-white/10">
                              {vuln.cvss ? vuln.cvss.toFixed(1) : "N/A"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <p className="text-caption uppercase tracking-widest text-muted-foreground/60">
                                <span>Installed:</span>{" "}
                                {vuln.installedVersion}
                              </p>
                              {vuln.fixedVersion ? (
                                <p className="text-caption uppercase tracking-widest text-green-400">
                                  <span>Fixed:</span>{" "}
                                  {vuln.fixedVersion}
                                </p>
                              ) : (
                                <Badge variant="secondary" className="rounded-none uppercase tracking-widest text-caption">
                                  No fix available
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="rounded-none uppercase tracking-widest text-caption border-white/10">
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
                  <div className="text-center py-8 text-caption uppercase tracking-widest text-muted-foreground/40">
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
