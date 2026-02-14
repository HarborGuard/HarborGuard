"use client";

import * as React from "react";
import { IconPackage } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SyftReport } from "@/types";

interface SyftResultsTabProps {
  syftResults: SyftReport | null;
}

export function SyftResultsTab({ syftResults }: SyftResultsTabProps) {
  const [syftCurrentPage, setSyftCurrentPage] = React.useState(1);
  const [syftItemsPerPage, setSyftItemsPerPage] = React.useState(20);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconPackage className="h-5 w-5" />
          Syft SBOM Generator
        </CardTitle>
        <CardDescription>
          Software Bill of Materials (SBOM) by Anchore
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="text-center p-4 border rounded-lg">
            <p className="text-2xl font-bold">
              {syftResults?.artifacts?.length || 0}
            </p>
            <p className="text-sm text-muted-foreground">
              Total Packages
            </p>
          </div>
          <div className="text-center p-4 border rounded-lg">
            <p className="text-2xl font-bold">
              {syftResults?.artifacts
                ? new Set(syftResults.artifacts.map((a) => a.type)).size
                : 0}
            </p>
            <p className="text-sm text-muted-foreground">
              Package Types
            </p>
          </div>
          <div className="text-center p-4 border rounded-lg">
            <p className="text-2xl font-bold">
              {syftResults?.schema?.version || "N/A"}
            </p>
            <p className="text-sm text-muted-foreground">
              SBOM Version
            </p>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Package Name</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Language</TableHead>
              <TableHead>Locations</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(syftResults?.artifacts || [])
              .slice(
                (syftCurrentPage - 1) * syftItemsPerPage,
                syftCurrentPage * syftItemsPerPage
              )
              .map((artifact, index) => (
                <TableRow key={index}>
                  <TableCell className="font-medium">
                    {artifact.name}
                  </TableCell>
                  <TableCell>{artifact.version}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{artifact.type}</Badge>
                  </TableCell>
                  <TableCell>{artifact.language || "N/A"}</TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {artifact.locations?.length || 0} location(s)
                    </span>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>

        {(syftResults?.artifacts?.length || 0) > syftItemsPerPage && (
          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                Items per page:
              </span>
              <Select
                value={syftItemsPerPage.toString()}
                onValueChange={(value) => {
                  setSyftItemsPerPage(Number(value));
                  setSyftCurrentPage(1);
                }}
              >
                <SelectTrigger className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-4">
              <p className="text-sm text-muted-foreground">
                Showing {(syftCurrentPage - 1) * syftItemsPerPage + 1}-
                {Math.min(
                  syftCurrentPage * syftItemsPerPage,
                  syftResults?.artifacts?.length || 0
                )}{" "}
                of {syftResults?.artifacts?.length || 0} packages
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setSyftCurrentPage(Math.max(1, syftCurrentPage - 1))
                  }
                  disabled={syftCurrentPage === 1}
                >
                  Previous
                </Button>
                <span className="text-sm">
                  Page {syftCurrentPage} of{" "}
                  {Math.ceil(
                    (syftResults?.artifacts?.length || 0) /
                      syftItemsPerPage
                  )}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setSyftCurrentPage(
                      Math.min(
                        Math.ceil(
                          (syftResults?.artifacts?.length || 0) /
                            syftItemsPerPage
                        ),
                        syftCurrentPage + 1
                      )
                    )
                  }
                  disabled={
                    syftCurrentPage >=
                    Math.ceil(
                      (syftResults?.artifacts?.length || 0) /
                        syftItemsPerPage
                    )
                  }
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
