"use client";

import * as React from "react";
import { IconPackage, IconInfoCircle } from "@tabler/icons-react";

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
  );
}
