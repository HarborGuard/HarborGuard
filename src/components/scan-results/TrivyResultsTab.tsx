"use client";

import * as React from "react";
import {
  IconBug,
  IconSearch,
  IconSortAscending,
  IconSortDescending,
  IconMessage,
  IconX,
} from "@tabler/icons-react";

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
                              getSeverityBadgeVariant(
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
                              {"\uD83D\uDCAC"} {comment.slice(0, 50)}
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
