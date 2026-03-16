'use client';

import React from 'react';
import {
  IconSearch,
  IconSortAscending,
  IconSortDescending,
  IconInfoCircle,
  IconMessage,
} from "@tabler/icons-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { VulnerabilityUrlMenu } from "@/components/vulnerability-url-menu";
import { getSeverityCssClass } from "@/lib/utils/severity-utils";

interface VulnerabilitiesTabProps {
  vulnerabilities: any[];
  vulnerabilitySearch: string;
  onVulnerabilitySearchChange: (value: string) => void;
  sortField: string;
  sortOrder: "asc" | "desc";
  onSortFieldChange: (field: string) => void;
  onSortOrderToggle: () => void;
  isFalsePositive: (cveId: string) => boolean;
  getComment: (cveId: string) => string | undefined;
  getSourceBadge: (source: string) => React.ReactNode;
  onVulnerabilityClick: (vuln: any) => void;
  onClassifyClick: (cveId: string, packageName: string) => void;
}

function filterVulnerabilities(items: any[], search: string) {
  if (!items) return [];
  if (!search) return items;

  const searchLower = search.toLowerCase();
  return items.filter(item => {
    return (
      item.cveId?.toLowerCase().includes(searchLower) ||
      item.packageName?.toLowerCase().includes(searchLower) ||
      item.description?.toLowerCase().includes(searchLower) ||
      item.severity?.toLowerCase().includes(searchLower) ||
      item.fixedVersion?.toLowerCase().includes(searchLower)
    );
  });
}

function sortFindings(items: any[], field: string, sortOrder: "asc" | "desc") {
  if (!items) return [];

  return [...items].sort((a, b) => {
    let aVal = a[field];
    let bVal = b[field];

    if (field === 'severity') {
      const severityOrder = { CRITICAL: 5, HIGH: 4, MEDIUM: 3, LOW: 2, INFO: 1 };
      aVal = severityOrder[aVal as keyof typeof severityOrder] || 0;
      bVal = severityOrder[bVal as keyof typeof severityOrder] || 0;
    }

    if (field === 'cvssScore') {
      aVal = aVal || 0;
      bVal = bVal || 0;
    }

    if (sortOrder === 'asc') {
      return aVal > bVal ? 1 : -1;
    } else {
      return aVal < bVal ? 1 : -1;
    }
  });
}

function getSeverityBadge(severity: string) {
  return (
    <Badge className={`${getSeverityCssClass(severity)} text-white`}>
      {severity}
    </Badge>
  );
}

export function VulnerabilitiesTab({
  vulnerabilities,
  vulnerabilitySearch,
  onVulnerabilitySearchChange,
  sortField,
  sortOrder,
  onSortFieldChange,
  onSortOrderToggle,
  isFalsePositive,
  getComment,
  getSourceBadge,
  onVulnerabilityClick,
  onClassifyClick,
}: VulnerabilitiesTabProps) {
  const handleSort = (field: string) => {
    if (sortField === field) {
      onSortOrderToggle();
    } else {
      onSortFieldChange(field);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Vulnerability Findings</CardTitle>
            <CardDescription>
              Security vulnerabilities detected by scanners
            </CardDescription>
          </div>
          <div className="relative w-64">
            <IconSearch className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search vulnerabilities..."
              value={vulnerabilitySearch}
              onChange={(e) => onVulnerabilitySearchChange(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead
                className="cursor-pointer"
                onClick={() => handleSort('cveId')}
              >
                CVE ID
                {sortField === 'cveId' && (
                  sortOrder === 'asc' ? <IconSortAscending className="inline h-4 w-4 ml-1" /> : <IconSortDescending className="inline h-4 w-4 ml-1" />
                )}
              </TableHead>
              <TableHead>Package</TableHead>
              <TableHead
                className="cursor-pointer"
                onClick={() => handleSort('severity')}
              >
                Severity
                {sortField === 'severity' && (
                  sortOrder === 'asc' ? <IconSortAscending className="inline h-4 w-4 ml-1" /> : <IconSortDescending className="inline h-4 w-4 ml-1" />
                )}
              </TableHead>
              <TableHead>Source</TableHead>
              <TableHead
                className="cursor-pointer"
                onClick={() => handleSort('cvssScore')}
              >
                CVSS
                {sortField === 'cvssScore' && (
                  sortOrder === 'asc' ? <IconSortAscending className="inline h-4 w-4 ml-1" /> : <IconSortDescending className="inline h-4 w-4 ml-1" />
                )}
              </TableHead>
              <TableHead>Fixed Version</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortFindings(filterVulnerabilities(vulnerabilities, vulnerabilitySearch), sortField, sortOrder).map((vuln: any) => {
              const comment = getComment(vuln.cveId);
              return (
                <TableRow
                  key={`${vuln.id}-${vuln.source}`}
                  className={`${isFalsePositive(vuln.cveId) ? 'opacity-50' : ''} cursor-pointer hover:bg-muted/50`}
                  onClick={() => onVulnerabilityClick(vuln)}
                >
                  <TableCell>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm">{vuln.cveId}</span>
                        {isFalsePositive(vuln.cveId) && (
                          <Badge variant="outline" className="text-xs">FP</Badge>
                        )}
                      </div>
                      {comment && (
                        <div className="flex items-start gap-1 mt-1">
                          <IconMessage className="h-3 w-3 text-muted-foreground mt-0.5 flex-shrink-0" />
                          <span className="text-xs text-muted-foreground italic">{comment}</span>
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {vuln.packageName}
                    {vuln.installedVersion && (
                      <span className="text-muted-foreground"> @ {vuln.installedVersion}</span>
                    )}
                  </TableCell>
                  <TableCell>{getSeverityBadge(vuln.severity)}</TableCell>
                  <TableCell>{getSourceBadge(vuln.source)}</TableCell>
                  <TableCell>{vuln.cvssScore?.toFixed(1) || '-'}</TableCell>
                  <TableCell className="font-mono text-sm text-green-600">
                    {vuln.fixedVersion || '-'}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-2">
                      <VulnerabilityUrlMenu
                        cve={vuln.cveId}
                        packageName={vuln.packageName}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          onClassifyClick(vuln.cveId, vuln.packageName);
                        }}
                      >
                        <IconInfoCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
