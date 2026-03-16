"use client";

import * as React from "react";
import {
  IconShield,
  IconSearch,
  IconMessage,
  IconX,
} from "@tabler/icons-react";

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { GrypeReport } from "@/types";
import { getSeverityBadgeVariant, getSeverityWeight } from "@/lib/utils/severity-utils";

interface GrypeResultsTabProps {
  grypeResults: GrypeReport | null;
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

export function GrypeResultsTab({
  grypeResults,
  showFalsePositives,
  setShowFalsePositives,
  classificationsLoading,
  getClassification,
  isFalsePositive,
  getComment,
  onOpenClassificationDialog,
  deleteClassification,
  onVulnerabilityClick,
}: GrypeResultsTabProps) {
  const [grypeSearch, setGrypeSearch] = React.useState("");

  // Filter and sort Grype vulnerabilities
  const filteredGrypeVulns = React.useMemo(() => {
    if (!grypeResults?.matches) return [];

    let filtered = grypeResults.matches.filter((match) => {
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
  }, [grypeResults, grypeSearch, showFalsePositives, isFalsePositive]);

  return (
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
              {grypeResults?.matches?.length || 0} vulnerabilities
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
                    onClick={() => onVulnerabilityClick(match, "grype")}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            onOpenClassificationDialog(
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
                            getSeverityBadgeVariant(
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
                            {"\uD83D\uDCAC"} {comment.slice(0, 50)}
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
  );
}
