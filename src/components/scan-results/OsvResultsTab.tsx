"use client";

import * as React from "react";
import { Package, Info } from "lucide-react";

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
import { OSVReport } from "@/types";

interface OsvResultsTabProps {
  osvResults: OSVReport;
}

export function OsvResultsTab({ osvResults }: OsvResultsTabProps) {
  return (
    <Card className="bg-surface-1 border-white/10 rounded-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-body-sm uppercase tracking-caps text-foreground">
          <Package className="h-4 w-4 text-accent" />
          OSV Vulnerability Database
        </CardTitle>
        <CardDescription className="text-caption uppercase tracking-widest text-muted-foreground/50">
          Open Source Vulnerability database analysis of container
          packages
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Summary Statistics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="text-center p-4 border border-white/10">
              <p className="text-2xl tracking-tight text-foreground">
                {osvResults.results?.reduce(
                  (total, result) =>
                    total + (result.packages?.length || 0),
                  0
                ) || 0}
              </p>
              <p className="text-caption uppercase tracking-widest text-muted-foreground/50">
                Total Packages
              </p>
            </div>
            <div className="text-center p-4 border border-white/10">
              <p className="text-2xl tracking-tight text-red-400">
                {osvResults.results?.reduce(
                  (total, result) =>
                    total +
                    (result.packages?.filter(
                      (pkg) => pkg.vulnerabilities.length > 0
                    ).length || 0),
                  0
                ) || 0}
              </p>
              <p className="text-caption uppercase tracking-widest text-muted-foreground/50">
                Vulnerable
              </p>
            </div>
            <div className="text-center p-4 border border-white/10">
              <p className="text-2xl tracking-tight text-foreground">
                {new Set(
                  osvResults.results?.flatMap(
                    (result) =>
                      result.packages?.map(
                        (pkg) => pkg.package.ecosystem
                      ) || []
                  )
                ).size || 0}
              </p>
              <p className="text-caption uppercase tracking-widest text-muted-foreground/50">
                Ecosystems
              </p>
            </div>
          </div>

          {/* Ecosystem Distribution */}
          <div className="mb-6">
            <h4 className="text-caption uppercase tracking-widest text-muted-foreground/60 mb-2">
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
                  <Badge key={ecosystem} variant="outline" className="rounded-none uppercase tracking-widest text-caption border-white/10">
                    {ecosystem}: {count}
                  </Badge>
                );
              })}
            </div>
          </div>

          {/* Vulnerable Packages Table */}
          <div>
            <h4 className="text-caption uppercase tracking-widest text-muted-foreground/60 mb-4">
              Vulnerable Packages
            </h4>
            <div className="border border-white/10 overflow-hidden rounded-none">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/10 hover:bg-transparent">
                    <TableHead className="uppercase tracking-widest text-caption text-muted-foreground/60 bg-surface-1">Package</TableHead>
                    <TableHead className="uppercase tracking-widest text-caption text-muted-foreground/60 bg-surface-1">Version</TableHead>
                    <TableHead className="uppercase tracking-widest text-caption text-muted-foreground/60 bg-surface-1">Ecosystem</TableHead>
                    <TableHead className="uppercase tracking-widest text-caption text-muted-foreground/60 bg-surface-1">Vulnerabilities</TableHead>
                    <TableHead className="uppercase tracking-widest text-caption text-muted-foreground/60 bg-surface-1">Severity</TableHead>
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
                        <TableRow key={index} className="border-white/10 hover:bg-white/5">
                          <TableCell className="text-body-sm text-foreground">
                            {pkg.package.name}
                          </TableCell>
                          <TableCell className="text-body-sm text-muted-foreground/60">{pkg.package.version}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="rounded-none uppercase tracking-widest text-caption border-white/10">
                              {pkg.package.ecosystem}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-body-sm text-muted-foreground/60">
                            {pkg.vulnerabilities.length}
                          </TableCell>
                          <TableCell>
                            {severityNum >= 9 && (
                              <Badge variant="destructive" className="rounded-none uppercase tracking-widest text-caption">
                                Critical
                              </Badge>
                            )}
                            {severityNum >= 7 && severityNum < 9 && (
                              <Badge className="rounded-none uppercase tracking-widest text-caption bg-orange-900/30 text-orange-400 border-orange-500/30">
                                High
                              </Badge>
                            )}
                            {severityNum >= 4 && severityNum < 7 && (
                              <Badge variant="secondary" className="rounded-none uppercase tracking-widest text-caption">
                                Medium
                              </Badge>
                            )}
                            {severityNum > 0 && severityNum < 4 && (
                              <Badge variant="outline" className="rounded-none uppercase tracking-widest text-caption border-white/10">Low</Badge>
                            )}
                            {severityNum === 0 && (
                              <Badge variant="outline" className="rounded-none uppercase tracking-widest text-caption border-white/10">Info</Badge>
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
              <Info className="h-12 w-12 mx-auto text-muted-foreground/20 mb-4" />
              <p className="text-caption uppercase tracking-widest text-muted-foreground/40">
                No vulnerable packages found
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
