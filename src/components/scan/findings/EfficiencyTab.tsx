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

interface EfficiencyTabProps {
  efficiency: any[];
  totalSizeBytes: string | number | null;
  totalWastedBytes: string | number | null;
  efficiencySearch: string;
  onEfficiencySearchChange: (value: string) => void;
}

function filterEfficiency(items: any[], search: string) {
  if (!items) return [];
  if (!search) return items;

  const searchLower = search.toLowerCase();
  return items.filter(item => {
    return (
      item.findingType?.toLowerCase().includes(searchLower) ||
      item.description?.toLowerCase().includes(searchLower) ||
      item.layerIndex?.toString().includes(searchLower)
    );
  });
}

export function EfficiencyTab({
  efficiency,
  totalSizeBytes,
  totalWastedBytes,
  efficiencySearch,
  onEfficiencySearchChange,
}: EfficiencyTabProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Efficiency Analysis</CardTitle>
            <CardDescription>
              Image size optimization and layer efficiency findings
            </CardDescription>
          </div>
          <div className="relative w-64">
            <IconSearch className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search efficiency issues..."
              value={efficiencySearch}
              onChange={(e) => onEfficiencySearchChange(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium">Total Size</p>
              <p className="text-2xl font-bold">
                {totalSizeBytes ?
                  `${(BigInt(totalSizeBytes) / BigInt(1024) / BigInt(1024)).toString()} MB` :
                  '0 MB'}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium">Wasted Space</p>
              <p className="text-2xl font-bold text-orange-500">
                {totalWastedBytes ?
                  `${(BigInt(totalWastedBytes) / BigInt(1024) / BigInt(1024)).toString()} MB` :
                  '0 MB'}
              </p>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Layer</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Size Impact</TableHead>
                <TableHead>Efficiency Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filterEfficiency(efficiency, efficiencySearch).map((eff: any) => (
                <TableRow key={eff.id}>
                  <TableCell>{eff.findingType}</TableCell>
                  <TableCell>{eff.layerIndex !== null ? `#${eff.layerIndex}` : '-'}</TableCell>
                  <TableCell className="max-w-md truncate">{eff.description}</TableCell>
                  <TableCell>
                    {eff.wastedBytes ?
                      `${(BigInt(eff.wastedBytes) / BigInt(1024) / BigInt(1024)).toString()} MB` :
                      '-'}
                  </TableCell>
                  <TableCell>
                    {eff.efficiencyScore ? `${eff.efficiencyScore.toFixed(1)}%` : '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
