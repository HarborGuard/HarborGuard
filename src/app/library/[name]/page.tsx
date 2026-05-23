"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Package,
  Bug,
  Search,
  ArrowUpAZ,
  ArrowDownAZ,
} from "lucide-react";

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { getSeverityBadgeVariant, getSeverityWeight } from "@/lib/utils/severity-utils";

interface LibraryVulnerability {
  cveId: string;
  severity: string;
  scannerSources: string[];
  scanCount: number;
  affectedImages: Array<{ name: string; tag: string }>;
  affectedImageCount: number;
  installedVersion?: string;
  fixedVersion?: string;
  cvssScore?: number;
  description?: string;
  title?: string;
  references: string[];
  vulnerabilityUrl?: string;
}

interface LibraryVulnerabilitiesResponse {
  package: string;
  totalScans: number;
  affectedScans: number;
  vulnerabilities: LibraryVulnerability[];
}

export default function LibraryDetailsPage() {
  const params = useParams();
  const libraryName = decodeURIComponent(params.name as string);

  const [data, setData] = useState<LibraryVulnerabilitiesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<string>("severity");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const encodedName = encodeURIComponent(libraryName);
    fetch(`/api/library/${encodedName}/vulnerabilities`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Request failed (${res.status})`);
        }
        return res.json() as Promise<LibraryVulnerabilitiesResponse>;
      })
      .then((body) => {
        if (cancelled) return;
        setData(body);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load");
        setData({
          package: libraryName,
          totalScans: 0,
          affectedScans: 0,
          vulnerabilities: [],
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [libraryName]);

  const vulnerabilities = data?.vulnerabilities ?? [];

  const filteredVulnerabilities = React.useMemo(() => {
    const lowerSearch = search.toLowerCase();
    const filtered = vulnerabilities.filter((vuln) => {
      if (!lowerSearch) return true;
      return (
        vuln.cveId.toLowerCase().includes(lowerSearch) ||
        (vuln.description || "").toLowerCase().includes(lowerSearch) ||
        vuln.severity.toLowerCase().includes(lowerSearch) ||
        vuln.affectedImages.some(
          (img) =>
            img.name.toLowerCase().includes(lowerSearch) ||
            img.tag.toLowerCase().includes(lowerSearch)
        )
      );
    });

    return [...filtered].sort((a, b) => {
      let aValue: any, bValue: any;

      switch (sortField) {
        case "severity":
          aValue = getSeverityWeight(a.severity);
          bValue = getSeverityWeight(b.severity);
          break;
        case "cvss":
          aValue = a.cvssScore || 0;
          bValue = b.cvssScore || 0;
          break;
        case "id":
          aValue = a.cveId;
          bValue = b.cveId;
          break;
        case "image":
          aValue = (a.affectedImages[0]?.name || "") + ":" + (a.affectedImages[0]?.tag || "");
          bValue = (b.affectedImages[0]?.name || "") + ":" + (b.affectedImages[0]?.tag || "");
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

  // Calculate statistics from the vulnerability data
  const stats = React.useMemo(() => {
    if (vulnerabilities.length === 0) {
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
    }

    const severityCounts = vulnerabilities.reduce((acc, vuln) => {
      const severity = vuln.severity.toLowerCase();
      acc[severity] = (acc[severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const affectedImagesSet = new Set<string>();
    vulnerabilities.forEach((vuln) => {
      vuln.affectedImages.forEach((img) => {
        affectedImagesSet.add(`${img.name}:${img.tag}`);
      });
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
  }, [vulnerabilities]);

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
                      {filteredVulnerabilities.map((vuln, index) => {
                        const imageCount = vuln.affectedImageCount;
                        const imageLabel =
                          imageCount === 0
                            ? "—"
                            : imageCount === 1
                              ? `${vuln.affectedImages[0].name}:${vuln.affectedImages[0].tag}`
                              : `${imageCount} images`;
                        return (
                          <TableRow
                            key={`${vuln.cveId}-${index}`}
                            className="border-white/10 hover:bg-white/5"
                          >
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
                                {vuln.cveId}
                              </p>
                            </TableCell>
                            <TableCell>
                              <p
                                className="text-body-sm max-w-md truncate text-muted-foreground"
                                title={vuln.description || ""}
                              >
                                {vuln.description || vuln.title || "No description available"}
                              </p>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className="rounded-none uppercase tracking-widest text-caption border-white/10"
                              >
                                {vuln.cvssScore ? vuln.cvssScore.toFixed(1) : "N/A"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <p className="text-caption uppercase tracking-widest text-muted-foreground/60">
                                  <span>Installed:</span>{" "}
                                  {vuln.installedVersion || "—"}
                                </p>
                                {vuln.fixedVersion ? (
                                  <p className="text-caption uppercase tracking-widest text-green-400">
                                    <span>Fixed:</span>{" "}
                                    {vuln.fixedVersion}
                                  </p>
                                ) : (
                                  <Badge
                                    variant="secondary"
                                    className="rounded-none uppercase tracking-widest text-caption"
                                  >
                                    No fix available
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className="rounded-none uppercase tracking-widest text-caption border-white/10"
                              >
                                {imageLabel}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <VulnerabilityUrlMenu
                                vulnerabilityId={vuln.cveId}
                                references={vuln.references || []}
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
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
