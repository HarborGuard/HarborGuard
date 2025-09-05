'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  IconPackage,
  IconCopy,
  IconDatabase,
  IconFingerprint,
  IconLicense,
  IconBuilding,
  IconCode,
  IconFileText,
  IconFolder,
  IconStack,
} from "@tabler/icons-react";
import { toast } from "sonner";

interface PackageDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  packageData: any;
}

export function PackageDetailModal({
  isOpen,
  onClose,
  packageData
}: PackageDetailModalProps) {
  if (!packageData) return null;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  const formatDate = (date: string | Date | null) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleString();
  };

  const renderValue = (value: any, defaultValue = 'N/A'): string => {
    if (value === null || value === undefined || value === '') return defaultValue;
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  };

  const formatLicense = (license: any): string => {
    if (!license) return 'N/A';
    if (typeof license === 'string') return license;
    if (typeof license === 'object') {
      if (license.name) return license.name;
      if (license.value) return license.value;
      if (license.license) return license.license;
      if (license.expression) return license.expression;
      if (Array.isArray(license)) {
        return license.map(l => formatLicense(l)).filter(Boolean).join(', ');
      }
    }
    return 'N/A';
  };

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      npm: 'bg-red-500',
      go: 'bg-blue-500',
      python: 'bg-yellow-500',
      java: 'bg-orange-500',
      ruby: 'bg-pink-500',
      rust: 'bg-gray-600',
      php: 'bg-purple-500',
      dotnet: 'bg-violet-500',
      binary: 'bg-slate-500',
      system: 'bg-green-500',
    };
    return colors[type?.toLowerCase()] || 'bg-gray-500';
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconPackage className="h-5 w-5" />
            Package Details: {packageData.packageName}
          </DialogTitle>
          <DialogDescription>
            Complete information about this package
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[calc(90vh-8rem)] pr-4">
          <Tabs defaultValue="general" className="w-full">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="location">Location</TabsTrigger>
              <TabsTrigger value="metadata">Metadata</TabsTrigger>
              <TabsTrigger value="dependencies">Dependencies</TabsTrigger>
              <TabsTrigger value="raw">Raw Data</TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="space-y-4 mt-4">
              {/* Basic Information */}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Package Name</label>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="text-sm font-semibold">{packageData.packageName}</code>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => copyToClipboard(packageData.packageName, 'Package name')}
                      >
                        <IconCopy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Version</label>
                    <code className="text-sm">{renderValue(packageData.version)}</code>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Type</label>
                    <div className="mt-1">
                      <Badge className={`${getTypeColor(packageData.type)} text-white`}>
                        {packageData.type}
                      </Badge>
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Source Scanner</label>
                    <div className="mt-1">
                      <Badge variant="outline">{packageData.source}</Badge>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Ecosystem</label>
                    <div className="flex items-center gap-2 mt-1">
                      <IconCode className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{renderValue(packageData.ecosystem)}</span>
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Language</label>
                    <span className="text-sm">{renderValue(packageData.language)}</span>
                  </div>
                </div>

                {/* License Information */}
                <div className="border rounded-lg p-4 bg-muted/50">
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <IconLicense className="h-4 w-4" />
                    License Information
                  </h3>
                  <div>
                    <code className="text-sm">{formatLicense(packageData.license)}</code>
                  </div>
                </div>

                {/* Publisher Information */}
                {(packageData.vendor || packageData.publisher) && (
                  <div className="border rounded-lg p-4 bg-muted/50">
                    <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                      <IconBuilding className="h-4 w-4" />
                      Publisher Information
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      {packageData.vendor && (
                        <div>
                          <label className="text-sm text-muted-foreground">Vendor</label>
                          <p className="text-sm mt-1">{packageData.vendor}</p>
                        </div>
                      )}
                      {packageData.publisher && (
                        <div>
                          <label className="text-sm text-muted-foreground">Publisher</label>
                          <p className="text-sm mt-1">{packageData.publisher}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* PURL */}
                {packageData.purl && (
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Package URL (PURL)</label>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="text-xs break-all">{packageData.purl}</code>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => copyToClipboard(packageData.purl, 'PURL')}
                      >
                        <IconCopy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="location" className="space-y-4 mt-4">
              {packageData.filePath && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">File Path</label>
                  <div className="flex items-center gap-2 mt-1">
                    <IconFolder className="h-4 w-4 text-muted-foreground" />
                    <code className="text-xs break-all">{packageData.filePath}</code>
                  </div>
                </div>
              )}

              {packageData.layerId && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Layer ID</label>
                  <div className="flex items-center gap-2 mt-1">
                    <IconStack className="h-4 w-4 text-muted-foreground" />
                    <code className="text-xs break-all">{packageData.layerId}</code>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Scan ID</label>
                  <code className="text-xs">{packageData.scanId}</code>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Database ID</label>
                  <div className="flex items-center gap-2">
                    <IconFingerprint className="h-4 w-4 text-muted-foreground" />
                    <code className="text-xs">{packageData.id}</code>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-muted-foreground">Created At</label>
                <span className="text-sm">{formatDate(packageData.createdAt)}</span>
              </div>
            </TabsContent>

            <TabsContent value="metadata" className="space-y-4 mt-4">
              {packageData.metadata && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-2 block">
                    Package Metadata
                  </label>
                  <pre className="p-3 bg-muted rounded-lg text-xs overflow-x-auto max-h-96">
                    {typeof packageData.metadata === 'string' 
                      ? packageData.metadata 
                      : JSON.stringify(packageData.metadata, null, 2)}
                  </pre>
                </div>
              )}

              {!packageData.metadata && (
                <div className="text-center py-8 text-muted-foreground">
                  No additional metadata available for this package
                </div>
              )}
            </TabsContent>

            <TabsContent value="dependencies" className="space-y-4 mt-4">
              {packageData.dependencies && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-2 block">
                    Package Dependencies
                  </label>
                  {Array.isArray(packageData.dependencies) ? (
                    <div className="space-y-1">
                      {packageData.dependencies.map((dep: any, index: number) => (
                        <div key={index} className="p-2 bg-muted rounded text-xs">
                          {typeof dep === 'string' ? dep : JSON.stringify(dep)}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <pre className="p-3 bg-muted rounded-lg text-xs overflow-x-auto max-h-96">
                      {typeof packageData.dependencies === 'string'
                        ? packageData.dependencies
                        : JSON.stringify(packageData.dependencies, null, 2)}
                    </pre>
                  )}
                </div>
              )}

              {!packageData.dependencies && (
                <div className="text-center py-8 text-muted-foreground">
                  No dependency information available for this package
                </div>
              )}
            </TabsContent>

            <TabsContent value="raw" className="mt-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  Complete Raw Package Data
                </label>
                <pre className="p-3 bg-muted rounded-lg text-xs overflow-x-auto">
                  {JSON.stringify(packageData, null, 2)}
                </pre>
              </div>
            </TabsContent>
          </Tabs>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}