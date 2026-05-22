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
  Package,
  Copy,
  Database,
  Fingerprint,
  ScrollText,
  Building2,
  Code2,
  FileText,
  Folder,
  Layers,
} from "lucide-react";
import { formatDate, renderValue, formatLicense } from "@/lib/utils/format-utils";
import { copyToClipboard } from "@/lib/clipboard";

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
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden border-white/10 rounded-none shadow-2xl p-0">
        <div className="p-8 border-b border-white/10 bg-surface-1 shrink-0">
          <DialogHeader className="space-y-3">
            <div className="flex items-center gap-3">
              <Package className="h-4 w-4 text-accent" />
              <DialogTitle className="text-sm uppercase tracking-wide-caps text-foreground">
                Package Details: {packageData.packageName}
              </DialogTitle>
            </div>
            <DialogDescription className="text-body-sm text-muted-foreground uppercase tracking-widest">
              Complete information about this package
            </DialogDescription>
          </DialogHeader>
        </div>

        <ScrollArea className="h-[calc(90vh-10rem)]">
          <div className="px-8 pt-6 pb-8">
          <Tabs defaultValue="general" className="w-full">
            <TabsList className="grid w-full grid-cols-5 rounded-none border border-white/10 bg-surface-1 h-auto p-0">
              <TabsTrigger value="general" className="rounded-none text-caption uppercase tracking-widest data-[state=active]:bg-white/5">General</TabsTrigger>
              <TabsTrigger value="location" className="rounded-none text-caption uppercase tracking-widest data-[state=active]:bg-white/5">Location</TabsTrigger>
              <TabsTrigger value="metadata" className="rounded-none text-caption uppercase tracking-widest data-[state=active]:bg-white/5">Metadata</TabsTrigger>
              <TabsTrigger value="dependencies" className="rounded-none text-caption uppercase tracking-widest data-[state=active]:bg-white/5">Dependencies</TabsTrigger>
              <TabsTrigger value="raw" className="rounded-none text-caption uppercase tracking-widest data-[state=active]:bg-white/5">Raw Data</TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="space-y-4 mt-4">
              {/* Basic Information */}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-caption uppercase tracking-widest text-muted-foreground/50">Package Name</label>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="text-body-sm text-foreground">{packageData.packageName}</code>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => copyToClipboard(packageData.packageName, 'Package name')}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-caption uppercase tracking-widest text-muted-foreground/50">Version</label>
                    <code className="text-sm">{renderValue(packageData.version)}</code>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-caption uppercase tracking-widest text-muted-foreground/50">Type</label>
                    <div className="mt-1">
                      <Badge className={`${getTypeColor(packageData.type)} text-white`}>
                        {packageData.type}
                      </Badge>
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-caption uppercase tracking-widest text-muted-foreground/50">Source Scanner</label>
                    <div className="mt-1">
                      <Badge variant="outline">{packageData.source}</Badge>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-caption uppercase tracking-widest text-muted-foreground/50">Ecosystem</label>
                    <div className="flex items-center gap-2 mt-1">
                      <Code2 className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{renderValue(packageData.ecosystem)}</span>
                    </div>
                  </div>
                  
                  <div>
                    <label className="text-caption uppercase tracking-widest text-muted-foreground/50">Language</label>
                    <span className="text-sm">{renderValue(packageData.language)}</span>
                  </div>
                </div>

                {/* License Information */}
                <div className="border border-white/10 p-4 bg-surface-1">
                  <div className="flex items-center gap-3 mb-3">
                    <ScrollText className="h-4 w-4 text-accent" />
                    <h3 className="text-sm uppercase tracking-wide-caps text-foreground">License Information</h3>
                  </div>
                  <div>
                    <code className="text-sm">{formatLicense(packageData.license)}</code>
                  </div>
                </div>

                {/* Publisher Information */}
                {(packageData.vendor || packageData.publisher) && (
                  <div className="border border-white/10 p-4 bg-surface-1">
                    <div className="flex items-center gap-3 mb-3">
                      <Building2 className="h-4 w-4 text-accent" />
                      <h3 className="text-sm uppercase tracking-wide-caps text-foreground">Publisher Information</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      {packageData.vendor && (
                        <div>
                          <label className="text-caption uppercase tracking-widest text-muted-foreground/50">Vendor</label>
                          <p className="text-body-sm text-foreground mt-1">{packageData.vendor}</p>
                        </div>
                      )}
                      {packageData.publisher && (
                        <div>
                          <label className="text-caption uppercase tracking-widest text-muted-foreground/50">Publisher</label>
                          <p className="text-body-sm text-foreground mt-1">{packageData.publisher}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* PURL */}
                {packageData.purl && (
                  <div>
                    <label className="text-caption uppercase tracking-widest text-muted-foreground/50">Package URL (PURL)</label>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="text-xs break-all">{packageData.purl}</code>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => copyToClipboard(packageData.purl, 'PURL')}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="location" className="space-y-4 mt-4">
              {packageData.filePath && (
                <div>
                  <label className="text-caption uppercase tracking-widest text-muted-foreground/50">File Path</label>
                  <div className="flex items-center gap-2 mt-1">
                    <Folder className="h-4 w-4 text-muted-foreground" />
                    <code className="text-xs break-all">{packageData.filePath}</code>
                  </div>
                </div>
              )}

              {packageData.layerId && (
                <div>
                  <label className="text-caption uppercase tracking-widest text-muted-foreground/50">Layer ID</label>
                  <div className="flex items-center gap-2 mt-1">
                    <Layers className="h-4 w-4 text-muted-foreground" />
                    <code className="text-xs break-all">{packageData.layerId}</code>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-caption uppercase tracking-widest text-muted-foreground/50">Scan ID</label>
                  <code className="text-xs">{packageData.scanId}</code>
                </div>
                
                <div>
                  <label className="text-caption uppercase tracking-widest text-muted-foreground/50">Database ID</label>
                  <div className="flex items-center gap-2">
                    <Fingerprint className="h-4 w-4 text-muted-foreground" />
                    <code className="text-xs">{packageData.id}</code>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-caption uppercase tracking-widest text-muted-foreground/50">Created At</label>
                <span className="text-sm">{formatDate(packageData.createdAt)}</span>
              </div>
            </TabsContent>

            <TabsContent value="metadata" className="space-y-4 mt-4">
              {packageData.metadata && (
                <div>
                  <label className="text-caption uppercase tracking-widest text-muted-foreground/50 mb-2 block">
                    Package Metadata
                  </label>
                  <pre className="p-4 bg-surface-1 border border-white/10 rounded-none text-caption overflow-x-auto max-h-96 text-muted-foreground">
                    {typeof packageData.metadata === 'string'
                      ? packageData.metadata
                      : JSON.stringify(packageData.metadata, null, 2)}
                  </pre>
                </div>
              )}

              {!packageData.metadata && (
                <div className="text-center py-16 text-caption uppercase tracking-widest text-muted-foreground/40">
                  No additional metadata available for this package
                </div>
              )}
            </TabsContent>

            <TabsContent value="dependencies" className="space-y-4 mt-4">
              {packageData.dependencies && (
                <div>
                  <label className="text-caption uppercase tracking-widest text-muted-foreground/50 mb-2 block">
                    Package Dependencies
                  </label>
                  {Array.isArray(packageData.dependencies) ? (
                    <div className="space-y-1">
                      {packageData.dependencies.map((dep: any, index: number) => (
                        <div key={index} className="p-2 border border-white/10 bg-surface-2 text-caption">
                          {typeof dep === 'string' ? dep : JSON.stringify(dep)}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <pre className="p-4 bg-surface-1 border border-white/10 rounded-none text-caption overflow-x-auto max-h-96 text-muted-foreground">
                      {typeof packageData.dependencies === 'string'
                        ? packageData.dependencies
                        : JSON.stringify(packageData.dependencies, null, 2)}
                    </pre>
                  )}
                </div>
              )}

              {!packageData.dependencies && (
                <div className="text-center py-16 text-caption uppercase tracking-widest text-muted-foreground/40">
                  No dependency information available for this package
                </div>
              )}
            </TabsContent>

            <TabsContent value="raw" className="mt-4">
              <div>
                <label className="text-caption uppercase tracking-widest text-muted-foreground/50 mb-2 block">
                  Complete Raw Package Data
                </label>
                <pre className="p-4 bg-surface-1 border border-white/10 rounded-none text-caption overflow-x-auto text-muted-foreground">
                  {JSON.stringify(packageData, null, 2)}
                </pre>
              </div>
            </TabsContent>
          </Tabs>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}