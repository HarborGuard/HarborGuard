'use client';

import React from 'react';
import { IconSearch } from "@tabler/icons-react";
import { Badge } from "@/components/ui/badge";
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
import { getSeverityCssClass } from "@/lib/severity-utils";

interface ComplianceTabProps {
  compliance: any[];
  complianceSearch: string;
  onComplianceSearchChange: (value: string) => void;
  getSourceBadge: (source: string) => React.ReactNode;
}

function filterCompliance(items: any[], search: string) {
  if (!items) return [];
  if (!search) return items;

  const searchLower = search.toLowerCase();
  return items.filter(item => {
    return (
      item.ruleName?.toLowerCase().includes(searchLower) ||
      item.category?.toLowerCase().includes(searchLower) ||
      item.message?.toLowerCase().includes(searchLower) ||
      item.severity?.toLowerCase().includes(searchLower)
    );
  });
}

function sortFindings(items: any[]) {
  if (!items) return [];

  return [...items].sort((a, b) => {
    const severityOrder = { CRITICAL: 5, HIGH: 4, MEDIUM: 3, LOW: 2, INFO: 1 };
    const aVal = severityOrder[a.severity as keyof typeof severityOrder] || 0;
    const bVal = severityOrder[b.severity as keyof typeof severityOrder] || 0;
    return aVal < bVal ? 1 : -1;
  });
}

function getSeverityBadge(severity: string) {
  return (
    <Badge className={`${getSeverityCssClass(severity)} text-white`}>
      {severity}
    </Badge>
  );
}

export function ComplianceTab({
  compliance,
  complianceSearch,
  onComplianceSearchChange,
  getSourceBadge,
}: ComplianceTabProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Compliance Findings</CardTitle>
            <CardDescription>
              Container best practices and security compliance issues
            </CardDescription>
          </div>
          <div className="relative w-64">
            <IconSearch className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search compliance issues..."
              value={complianceSearch}
              onChange={(e) => onComplianceSearchChange(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rule</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Message</TableHead>
              <TableHead>Source</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortFindings(filterCompliance(compliance, complianceSearch)).map((comp: any) => (
              <TableRow key={`${comp.id}-${comp.source}`}>
                <TableCell className="font-mono text-sm">{comp.ruleName}</TableCell>
                <TableCell>{comp.category}</TableCell>
                <TableCell>{getSeverityBadge(comp.severity)}</TableCell>
                <TableCell className="max-w-md truncate">{comp.message}</TableCell>
                <TableCell>{getSourceBadge(comp.source)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
