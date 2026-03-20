"use client";

import * as React from "react";
import {
  IconSettings,
  IconSearch,
  IconSortAscending,
  IconSortDescending,
} from "@tabler/icons-react";

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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconSettings className="h-5 w-5" />
          Dockle Configuration Linter
        </CardTitle>
        <CardDescription>
          Container image linter for security and best practices
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Summary Statistics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="text-center p-4 border rounded-lg">
              <p className="text-2xl font-bold text-red-600">
                {dockleResults?.summary?.fatal || 0}
              </p>
              <p className="text-sm text-muted-foreground">Fatal</p>
            </div>
            <div className="text-center p-4 border rounded-lg">
              <p className="text-2xl font-bold text-orange-600">
                {dockleResults?.summary?.warn || 0}
              </p>
              <p className="text-sm text-muted-foreground">Warnings</p>
            </div>
            <div className="text-center p-4 border rounded-lg">
              <p className="text-2xl font-bold text-blue-600">
                {dockleResults?.summary?.info || 0}
              </p>
              <p className="text-sm text-muted-foreground">Info</p>
            </div>
            <div className="text-center p-4 border rounded-lg">
              <p className="text-2xl font-bold">
                {dockleResults?.summary?.pass || 0}
              </p>
              <p className="text-sm text-muted-foreground">Passed</p>
            </div>
          </div>

          <Separator />

          {/* Search and Filter Bar */}
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <IconSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search rules, codes, or descriptions..."
                value={dockleSearch}
                onChange={(e) => setDockleSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="text-sm text-muted-foreground">
              {filteredDockleFindings.length} of{" "}
              {dockleResults?.details?.length || 0} findings
            </div>
          </div>

          {/* Findings Table */}
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <Button
                      variant="ghost"
                      className="h-auto p-0 font-medium"
                      onClick={() => handleDockleSort("level")}
                    >
                      Level
                      {dockleSortField === "level" &&
                        (dockleSortOrder === "asc" ? (
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
                      onClick={() => handleDockleSort("code")}
                    >
                      Rule Code
                      {dockleSortField === "code" &&
                        (dockleSortOrder === "asc" ? (
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
                      onClick={() => handleDockleSort("title")}
                    >
                      Title
                      {dockleSortField === "title" &&
                        (dockleSortOrder === "asc" ? (
                          <IconSortAscending className="ml-1 h-4 w-4" />
                        ) : (
                          <IconSortDescending className="ml-1 h-4 w-4" />
                        ))}
                    </Button>
                  </TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDockleFindings.map((detail, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      <Badge
                        variant={
                          detail.level === "FATAL"
                            ? "destructive"
                            : detail.level === "WARN"
                            ? "secondary"
                            : "outline"
                        }
                      >
                        {detail.level}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <code className="text-sm bg-muted px-2 py-1 rounded">
                        {detail.code}
                      </code>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{detail.title}</p>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm text-muted-foreground max-w-md">
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
