"use client";

import * as React from "react";
import {
  Shield,
  Search,
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
    <Card className="bg-surface-1 border-white/10 rounded-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-body-sm uppercase tracking-caps text-foreground">
          <Shield className="h-4 w-4 text-accent" />
          Grype Vulnerability Scanner
        </CardTitle>
        <CardDescription className="text-caption uppercase tracking-widest text-muted-foreground/50">
          Container vulnerability scanner by Anchore
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
                value={grypeSearch}
                onChange={(e) => setGrypeSearch(e.target.value)}
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
              {filteredGrypeVulns.length} of{" "}
              {grypeResults?.matches?.length || 0} vulnerabilities
            </div>
          </div>

          <div className="border border-white/10 overflow-hidden rounded-none">
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead className="uppercase tracking-widest text-caption text-muted-foreground/60 bg-surface-1">Actions</TableHead>
                <TableHead className="uppercase tracking-widest text-caption text-muted-foreground/60 bg-surface-1">Severity</TableHead>
                <TableHead className="uppercase tracking-widest text-caption text-muted-foreground/60 bg-surface-1">Vulnerability</TableHead>
                <TableHead className="uppercase tracking-widest text-caption text-muted-foreground/60 bg-surface-1">Package</TableHead>
                <TableHead className="uppercase tracking-widest text-caption text-muted-foreground/60 bg-surface-1">Version</TableHead>
                <TableHead className="uppercase tracking-widest text-caption text-muted-foreground/60 bg-surface-1">Fix Available</TableHead>
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
                    className={`border-white/10 hover:bg-white/5 cursor-pointer${
                      isMarkedFalsePositive ? " opacity-50" : ""
                    }`}
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
                                match.vulnerability.id
                              )
                            }
                            className="text-red-400 hover:text-red-300 hover:bg-red-950/20"
                          >
                            <X className="h-4 w-4" />
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
                          className="rounded-none uppercase tracking-widest text-caption"
                        >
                          {match.vulnerability.severity}
                        </Badge>
                        {isMarkedFalsePositive && (
                          <Badge variant="outline" className="rounded-none uppercase tracking-widest text-caption border-white/10">
                            False Positive
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-body-sm text-foreground">
                            {match.vulnerability.id}
                          </p>
                          {comment && (
                            <span title={comment}>
                              <MessageSquare className="h-4 w-4 text-muted-foreground/40" />
                            </span>
                          )}
                        </div>
                        <p className="text-caption text-muted-foreground/60 mt-0.5">
                          {match.vulnerability.description?.slice(
                            0,
                            80
                          )}
                          ...
                        </p>
                        {comment && (
                          <p className="text-caption text-accent mt-1">
                            {comment.slice(0, 50)}
                            {comment.length > 50 ? "..." : ""}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-body-sm">{match.artifact.name}</TableCell>
                    <TableCell className="text-body-sm text-muted-foreground/60">{match.artifact.version}</TableCell>
                    <TableCell>
                      {match.vulnerability.fix?.versions?.[0] ? (
                        <Badge className="rounded-none uppercase tracking-widest text-caption bg-green-900/30 text-green-400 border-green-500/30">
                          {match.vulnerability.fix.versions[0]}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="rounded-none uppercase tracking-widest text-caption">No fix</Badge>
                      )}
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
