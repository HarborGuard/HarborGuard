"use client";

import * as React from "react";
import { Package } from "lucide-react";

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
    <Card className="bg-surface-1 border-white/10 rounded-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-body-sm uppercase tracking-caps text-foreground">
          <Package className="h-4 w-4 text-accent" />
          Syft SBOM Generator
        </CardTitle>
        <CardDescription className="text-caption uppercase tracking-widest text-muted-foreground/50">
          Software Bill of Materials (SBOM) by Anchore
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="text-center p-4 border border-white/10">
            <p className="text-2xl tracking-tight text-foreground">
              {syftResults?.artifacts?.length || 0}
            </p>
            <p className="text-caption uppercase tracking-widest text-muted-foreground/50">
              Total Packages
            </p>
          </div>
          <div className="text-center p-4 border border-white/10">
            <p className="text-2xl tracking-tight text-foreground">
              {syftResults?.artifacts
                ? new Set(syftResults.artifacts.map((a) => a.type)).size
                : 0}
            </p>
            <p className="text-caption uppercase tracking-widest text-muted-foreground/50">
              Package Types
            </p>
          </div>
          <div className="text-center p-4 border border-white/10">
            <p className="text-2xl tracking-tight text-foreground">
              {syftResults?.schema?.version || "N/A"}
            </p>
            <p className="text-caption uppercase tracking-widest text-muted-foreground/50">
              SBOM Version
            </p>
          </div>
        </div>

        <div className="border border-white/10 overflow-hidden rounded-none">
        <Table>
          <TableHeader>
            <TableRow className="border-white/10 hover:bg-transparent">
              <TableHead className="uppercase tracking-widest text-caption text-muted-foreground/60 bg-surface-1">Package Name</TableHead>
              <TableHead className="uppercase tracking-widest text-caption text-muted-foreground/60 bg-surface-1">Version</TableHead>
              <TableHead className="uppercase tracking-widest text-caption text-muted-foreground/60 bg-surface-1">Type</TableHead>
              <TableHead className="uppercase tracking-widest text-caption text-muted-foreground/60 bg-surface-1">Language</TableHead>
              <TableHead className="uppercase tracking-widest text-caption text-muted-foreground/60 bg-surface-1">Locations</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(syftResults?.artifacts || [])
              .slice(
                (syftCurrentPage - 1) * syftItemsPerPage,
                syftCurrentPage * syftItemsPerPage
              )
              .map((artifact, index) => (
                <TableRow key={index} className="border-white/10 hover:bg-white/5">
                  <TableCell className="text-body-sm text-foreground">
                    {artifact.name}
                  </TableCell>
                  <TableCell className="text-body-sm text-muted-foreground/60">{artifact.version}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="rounded-none uppercase tracking-widest text-caption border-white/10">{artifact.type}</Badge>
                  </TableCell>
                  <TableCell className="text-body-sm text-muted-foreground/60">{artifact.language || "N/A"}</TableCell>
                  <TableCell>
                    <span className="text-caption uppercase tracking-widest text-muted-foreground/40">
                      {artifact.locations?.length || 0} location(s)
                    </span>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
        </div>

        {(syftResults?.artifacts?.length || 0) > syftItemsPerPage && (
          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center gap-2">
              <span className="text-caption uppercase tracking-widest text-muted-foreground/60">
                Items per page:
              </span>
              <Select
                value={syftItemsPerPage.toString()}
                onValueChange={(value) => {
                  setSyftItemsPerPage(Number(value));
                  setSyftCurrentPage(1);
                }}
              >
                <SelectTrigger className="w-20 border-white/10 rounded-none text-caption">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-overlay border-white/10 rounded-none">
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-4">
              <p className="text-caption uppercase tracking-widest text-muted-foreground/50">
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
                  className="rounded-none border-white/10 hover:bg-white/5 uppercase tracking-widest text-caption"
                >
                  Previous
                </Button>
                <span className="text-caption uppercase tracking-widest text-muted-foreground/60">
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
                  className="rounded-none border-white/10 hover:bg-white/5 uppercase tracking-widest text-caption"
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
