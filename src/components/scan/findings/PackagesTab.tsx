'use client';

import React from 'react';
import { IconSearch } from "@tabler/icons-react";
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
import { formatLicense } from "@/lib/format-utils";

interface PackagesTabProps {
  packages: any[];
  packageSearch: string;
  onPackageSearchChange: (value: string) => void;
  getSourceBadge: (source: string) => React.ReactNode;
  onPackageClick: (pkg: any) => void;
}

function filterPackages(items: any[], search: string) {
  if (!items) return [];
  if (!search) return items;

  const searchLower = search.toLowerCase();
  return items.filter(item => {
    return (
      item.packageName?.toLowerCase().includes(searchLower) ||
      item.version?.toLowerCase().includes(searchLower) ||
      item.type?.toLowerCase().includes(searchLower) ||
      item.ecosystem?.toLowerCase().includes(searchLower) ||
      item.license?.toLowerCase().includes(searchLower)
    );
  });
}

export function PackagesTab({
  packages,
  packageSearch,
  onPackageSearchChange,
  getSourceBadge,
  onPackageClick,
}: PackagesTabProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Package Inventory</CardTitle>
            <CardDescription>
              All packages and dependencies detected in the image
            </CardDescription>
          </div>
          <div className="relative w-64">
            <IconSearch className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search packages..."
              value={packageSearch}
              onChange={(e) => onPackageSearchChange(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Package Name</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Ecosystem</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>License</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filterPackages(packages, packageSearch).map((pkg: any) => (
              <TableRow
                key={`${pkg.id}-${pkg.source}`}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => onPackageClick(pkg)}
              >
                <TableCell className="font-mono text-sm">{pkg.packageName}</TableCell>
                <TableCell className="font-mono text-sm">{pkg.version || '-'}</TableCell>
                <TableCell>{pkg.type}</TableCell>
                <TableCell>{pkg.ecosystem || '-'}</TableCell>
                <TableCell>{getSourceBadge(pkg.source)}</TableCell>
                <TableCell className="text-sm">{formatLicense(pkg.license)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
