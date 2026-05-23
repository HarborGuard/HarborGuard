"use client";

import * as React from "react";
import {
  Bug,
  Search,
  ArrowUpAZ,
  ArrowDownAZ,
  MessageSquare,
  X,
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
import { TrivyReport } from "@/types";
import { getSeverityBadgeVariant, getSeverityWeight } from "@/lib/utils/severity-utils";

interface TrivyResultsTabProps {
  trivyResults: TrivyReport | null;
  showFalsePositives: boolean;
  setShowFalsePositives: (value: boolean) => void;
  classificationsLoading: boolean;
  getClassification: (cveId: string) => any;
  isFalsePositive: (cveId: string) => boolean;
  getComment: (cveId: string) => string | undefined;
  onOpenClassificationDialog: (cveId: string) => void;
  deleteClassification: (cveId: string) => Promise<void>;
  onVulnerabilityClick: (vuln: any, source: "trivy" | "grype") => void;
}

export function TrivyResultsTab({
  trivyResults,
  showFalsePositives,
  setShowFalsePositives,
  classificationsLoading,
  getClassification,
  isFalsePositive,
  getComment,
  onOpenClassificationDialog,
  deleteClassification,
  onVulnerabilityClick,
}: TrivyResultsTabProps) {
  const [trivySearch, setTrivySearch] = React.useState("");
  const [trivySortField, setTrivySortField] = React.useState<string>("severity");
  const [trivySortOrder, setTrivySortOrder] = React.useState<"asc" | "desc">("desc");

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

  const handleTrivySort = (field: string) => {
    if (trivySortField === field) {
      setTrivySortOrder(trivySortOrder === "asc" ? "desc" : "asc");
    } else {
      setTrivySortField(field);
      setTrivySortOrder("desc");
    }
  };

  return (
    <Card className="bg-surface-1 border-white/10 rounded-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-body-sm uppercase tracking-caps text-foreground">
          <Bug className="h-4 w-4 text-accent" />
          Trivy Vulnerability Scan
        </CardTitle>
        <CardDescription className="text-caption uppercase tracking-widest text-muted-foreground/50">
          Comprehensive vulnerability scanner for containers
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Search and Filter Bar */}
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground/40 h-4 w-4" />
              <Input
                placeholder="Search vulnerabilities, packages, or CVE IDs..."
                value={trivySearch}
                onChange={(e) => setTrivySearch(e.target.value)}
                className="pl-10 rounded-none border-white/10 bg-transparent text-body-sm placeholder:text-muted-foreground/30 placeholder:uppercase placeholder:tracking-caps"
              />
            </div>
            <Button
              variant={showFalsePositives ? "outline" : "secondary"}
              size="sm"
              onClick={() => setShowFalsePositives(!showFalsePositives)}
              className="flex items-center gap-2 rounded-none border-white/10 hover:bg-white/5 uppercase tracking-widest text-caption"
              disabled={classificationsLoading}
            >
              {classificationsLoading && (
                <div className="animate-spin h-3 w-3 border border-current border-t-transparent rounded-full" />
              )}
              {showFalsePositives ? "Hide" : "Show"} False Positives
            </Button>
            <div className="text-caption uppercase tracking-widest text-muted-foreground/50">
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
          <div className="border border-white/10 overflow-hidden rounded-none">
            <Table>
              <TableHeader>
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead className="uppercase tracking-widest text-caption text-muted-foreground/60 bg-surface-1">Actions</TableHead>
                  <TableHead className="uppercase tracking-widest text-caption text-muted-foreground/60 bg-surface-1">
                    <Button
                      variant="ghost"
                      className="h-auto p-0 text-caption uppercase tracking-widest hover:bg-transparent hover:text-foreground"
                      onClick={() => handleTrivySort("severity")}
                    >
                      Severity
                      {trivySortField === "severity" &&
                        (trivySortOrder === "asc" ? (
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
                      onClick={() => handleTrivySort("vulnerability")}
                    >
                      Vulnerability
                      {trivySortField === "vulnerability" &&
                        (trivySortOrder === "asc" ? (
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
                      onClick={() => handleTrivySort("package")}
                    >
                      Package
                      {trivySortField === "package" &&
                        (trivySortOrder === "asc" ? (
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
                      onClick={() => handleTrivySort("cvss")}
                    >
                      CVSS Score
                      {trivySortField === "cvss" &&
                        (trivySortOrder === "asc" ? (
                          <ArrowUpAZ className="ml-1 h-4 w-4" />
                        ) : (
                          <ArrowDownAZ className="ml-1 h-4 w-4" />
                        ))}
                    </Button>
                  </TableHead>
                  <TableHead className="uppercase tracking-widest text-caption text-muted-foreground/60 bg-surface-1">Fixed Version</TableHead>
                  <TableHead className="uppercase tracking-widest text-caption text-muted-foreground/60 bg-surface-1">Published</TableHead>
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
                      className={`border-white/10 hover:bg-white/5 cursor-pointer${
                        isMarkedFalsePositive ? " opacity-50" : ""
                      }`}
                      onClick={() => onVulnerabilityClick(vuln, "trivy")}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              onOpenClassificationDialog(
                                vuln.VulnerabilityID
                              )
                            }
                            className="flex items-center gap-1 rounded-none border-white/10 hover:bg-white/5 uppercase tracking-widest text-caption"
                          >
                            <MessageSquare className="h-4 w-4" />
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
                              className="text-red-400 hover:text-red-300 hover:bg-red-950/20"
                            >
                              <X className="h-4 w-4" />
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
                              getSeverityBadgeVariant(
                                vuln.Severity || ""
                              ) as any
                            }
                            className="rounded-none uppercase tracking-widest text-caption"
                          >
                            {vuln.Severity}
                          </Badge>
                          {isMarkedFalsePositive && (
                            <Badge
                              variant="outline"
                              className="rounded-none uppercase tracking-widest text-caption border-white/10"
                            >
                              False Positive
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-body-sm text-foreground">
                              {vuln.VulnerabilityID}
                            </p>
                            {comment && (
                              <span title={comment}>
                                <MessageSquare className="h-4 w-4 text-muted-foreground/40" />
                              </span>
                            )}
                          </div>
                          <p className="text-caption text-muted-foreground/60 mt-0.5">
                            {vuln.Title || vuln.Description}
                          </p>
                          {comment && (
                            <p className="text-caption text-accent mt-1">
                              {comment.slice(0, 50)}
                              {comment.length > 50 ? "..." : ""}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-body-sm text-foreground">{vuln.PkgName}</p>
                          <p className="text-caption text-muted-foreground/60">
                            {vuln.InstalledVersion}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="rounded-none uppercase tracking-widest text-caption border-white/10">
                          {vuln.CVSS?.nvd?.V3Score ||
                            vuln.CVSS?.redhat?.V3Score ||
                            "N/A"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {vuln.FixedVersion ? (
                          <Badge className="rounded-none uppercase tracking-widest text-caption bg-green-900/30 text-green-400 border-green-500/30">
                            {vuln.FixedVersion}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="rounded-none uppercase tracking-widest text-caption">No fix</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-caption uppercase tracking-widest text-muted-foreground/60">
                        {vuln.publishedDate
                          ? new Date(
                              vuln.publishedDate
                            ).toLocaleDateString()
                          : "\u2014"}
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
  );
}
