"use client";

import * as React from "react";
import {
  Settings,
  Search,
  ArrowUpAZ,
  ArrowDownAZ,
} from "lucide-react";

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
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { DockleReport } from "@/types";

interface DockleResultsTabProps {
  dockleResults: DockleReport | null;
}

export function DockleResultsTab({ dockleResults }: DockleResultsTabProps) {
  const [dockleSearch, setDockleSearch] = React.useState("");
  const [dockleSortField, setDockleSortField] = React.useState<string>("level");
  const [dockleSortOrder, setDockleSortOrder] = React.useState<"asc" | "desc">("desc");

  const getLevelWeight = (level: string) => {
    switch (level.toUpperCase()) {
      case "FATAL":
        return 3;
      case "WARN":
        return 2;
      case "INFO":
        return 1;
      default:
        return 0;
    }
  };

  // Filter and sort Dockle findings
  const filteredDockleFindings = React.useMemo(() => {
    if (!dockleResults?.details) return [];

    let filtered = dockleResults.details.filter(
      (detail) =>
        detail.code.toLowerCase().includes(dockleSearch.toLowerCase()) ||
        detail.title.toLowerCase().includes(dockleSearch.toLowerCase()) ||
        detail.details.toLowerCase().includes(dockleSearch.toLowerCase()) ||
        detail.level.toLowerCase().includes(dockleSearch.toLowerCase())
    );

    return filtered.sort((a, b) => {
      let aValue: any, bValue: any;

      switch (dockleSortField) {
        case "level":
          aValue = getLevelWeight(a.level);
          bValue = getLevelWeight(b.level);
          break;
        case "code":
          aValue = a.code;
          bValue = b.code;
          break;
        case "title":
          aValue = a.title;
          bValue = b.title;
          break;
        default:
          return 0;
      }

      if (dockleSortOrder === "asc") {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });
  }, [dockleResults, dockleSearch, dockleSortField, dockleSortOrder]);

  const handleDockleSort = (field: string) => {
    if (dockleSortField === field) {
      setDockleSortOrder(dockleSortOrder === "asc" ? "desc" : "asc");
    } else {
      setDockleSortField(field);
      setDockleSortOrder("desc");
    }
  };

  return (
    <Card className="bg-surface-1 border-white/10 rounded-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-body-sm uppercase tracking-caps text-foreground">
          <Settings className="h-4 w-4 text-accent" />
          Dockle Configuration Linter
        </CardTitle>
        <CardDescription className="text-caption uppercase tracking-widest text-muted-foreground/50">
          Container image linter for security and best practices
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Summary Statistics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center p-4 border border-white/10">
              <p className="text-2xl tracking-tight text-red-400">
                {dockleResults?.summary?.fatal || 0}
              </p>
              <p className="text-caption uppercase tracking-widest text-muted-foreground/50">Fatal</p>
            </div>
            <div className="text-center p-4 border border-white/10">
              <p className="text-2xl tracking-tight text-orange-400">
                {dockleResults?.summary?.warn || 0}
              </p>
              <p className="text-caption uppercase tracking-widest text-muted-foreground/50">Warnings</p>
            </div>
            <div className="text-center p-4 border border-white/10">
              <p className="text-2xl tracking-tight text-blue-400">
                {dockleResults?.summary?.info || 0}
              </p>
              <p className="text-caption uppercase tracking-widest text-muted-foreground/50">Info</p>
            </div>
            <div className="text-center p-4 border border-white/10">
              <p className="text-2xl tracking-tight text-foreground">
                {dockleResults?.summary?.pass || 0}
              </p>
              <p className="text-caption uppercase tracking-widest text-muted-foreground/50">Passed</p>
            </div>
          </div>

          <Separator className="border-white/10" />

          {/* Search and Filter Bar */}
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground/40 h-4 w-4" />
              <Input
                placeholder="Search rules, codes, or descriptions..."
                value={dockleSearch}
                onChange={(e) => setDockleSearch(e.target.value)}
                className="pl-10 rounded-none border-white/10 bg-transparent text-body-sm placeholder:text-muted-foreground/30 placeholder:uppercase placeholder:tracking-caps"
              />
            </div>
            <div className="text-caption uppercase tracking-widest text-muted-foreground/50">
              {filteredDockleFindings.length} of{" "}
              {dockleResults?.details?.length || 0} findings
            </div>
          </div>

          {/* Findings Table */}
          <div className="border border-white/10 overflow-hidden rounded-none">
            <Table>
              <TableHeader>
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead className="uppercase tracking-widest text-caption text-muted-foreground/60 bg-surface-1">
                    <Button
                      variant="ghost"
                      className="h-auto p-0 text-caption uppercase tracking-widest hover:bg-transparent hover:text-foreground"
                      onClick={() => handleDockleSort("level")}
                    >
                      Level
                      {dockleSortField === "level" &&
                        (dockleSortOrder === "asc" ? (
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
                      onClick={() => handleDockleSort("code")}
                    >
                      Rule Code
                      {dockleSortField === "code" &&
                        (dockleSortOrder === "asc" ? (
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
                      onClick={() => handleDockleSort("title")}
                    >
                      Title
                      {dockleSortField === "title" &&
                        (dockleSortOrder === "asc" ? (
                          <ArrowUpAZ className="ml-1 h-4 w-4" />
                        ) : (
                          <ArrowDownAZ className="ml-1 h-4 w-4" />
                        ))}
                    </Button>
                  </TableHead>
                  <TableHead className="uppercase tracking-widest text-caption text-muted-foreground/60 bg-surface-1">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDockleFindings.map((detail, index) => (
                  <TableRow key={index} className="border-white/10 hover:bg-white/5">
                    <TableCell>
                      <Badge
                        variant={
                          detail.level === "FATAL"
                            ? "destructive"
                            : detail.level === "WARN"
                            ? "secondary"
                            : "outline"
                        }
                        className="rounded-none uppercase tracking-widest text-caption"
                      >
                        {detail.level}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <code className="text-caption bg-surface-1 border border-white/10 px-2 py-1">
                        {detail.code}
                      </code>
                    </TableCell>
                    <TableCell>
                      <p className="text-body-sm text-foreground">{detail.title}</p>
                    </TableCell>
                    <TableCell>
                      <p className="text-caption text-muted-foreground/60 max-w-md">
                        {detail.details}
                      </p>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
