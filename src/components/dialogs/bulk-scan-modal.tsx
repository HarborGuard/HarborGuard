"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Play,
  Settings,
  Filter,
  Activity,
  Layers2Icon,
} from "lucide-react";
import { useBulkScan } from "@/hooks/useBulkScan";
import { BulkScanJobsList } from "@/components/bulk-scan-jobs-list";

interface BulkScanModalProps {
  children: React.ReactNode;
}

export function BulkScanModal({ children }: BulkScanModalProps) {
  const [activeTab, setActiveTab] = useState("new");
  const [open, setOpen] = useState(false);

  const {
    jobs,
    loading,
    jobsLoading,
    scannerAvailability,
    formData,
    handleSubmit,
    handleInputChange,
    fetchJobs,
  } = useBulkScan(open);

  const onSubmit = async (e: React.FormEvent) => {
    const success = await handleSubmit(e);
    if (success) {
      setActiveTab("jobs");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers2Icon className="h-5 w-5" />
            Bulk Image Scanning
          </DialogTitle>
          <DialogDescription>
            Scan multiple container images at once using pattern matching
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="new" className="flex items-center gap-2">
              <Play className="h-4 w-4" />
              New Bulk Scan
            </TabsTrigger>
            <TabsTrigger value="jobs" className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Active Jobs
            </TabsTrigger>
          </TabsList>

          <TabsContent value="new" className="space-y-4">
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Scan Name (Optional)</Label>
                  <Input
                    id="name"
                    placeholder="e.g., Weekly Security Scan"
                    value={formData.name}
                    onChange={(e) => handleInputChange("name", e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="maxImages">Max Images</Label>
                  <Input
                    id="maxImages"
                    type="number"
                    min="1"
                    max="1000"
                    value={formData.maxImages}
                    onChange={(e) =>
                      handleInputChange("maxImages", parseInt(e.target.value))
                    }
                  />
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Filter className="h-5 w-5" />
                  Image Filters
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="imagePattern">Image Name Pattern</Label>
                    <Input
                      id="imagePattern"
                      placeholder="e.g., nginx, app-*, *web*"
                      value={formData.imagePattern}
                      onChange={(e) =>
                        handleInputChange("imagePattern", e.target.value)
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="tagPattern">Tag Pattern</Label>
                    <Input
                      id="tagPattern"
                      placeholder="e.g., latest, v*, *-prod"
                      value={formData.tagPattern}
                      onChange={(e) =>
                        handleInputChange("tagPattern", e.target.value)
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="registryPattern">Registry Pattern</Label>
                    <Input
                      id="registryPattern"
                      placeholder="e.g., docker.io, gcr.io/*"
                      value={formData.registryPattern}
                      onChange={(e) =>
                        handleInputChange("registryPattern", e.target.value)
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="excludeTagPattern">Exclude Tag Pattern</Label>
                    <Input
                      id="excludeTagPattern"
                      placeholder="e.g., *-test, *-dev"
                      value={formData.excludeTagPattern}
                      onChange={(e) =>
                        handleInputChange("excludeTagPattern", e.target.value)
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Scanner Configuration
                </h3>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {[
                    { key: "enableTrivy", name: "trivy", label: "Trivy", description: "Comprehensive vulnerability scanner" },
                    { key: "enableGrype", name: "grype", label: "Grype", description: "Vulnerability scanner by Anchore" },
                    { key: "enableSyft", name: "syft", label: "Syft", description: "SBOM generator" },
                    { key: "enableDockle", name: "dockle", label: "Dockle", description: "Container linter for best practices" },
                    { key: "enableOsv", name: "osv", label: "OSV", description: "OSV vulnerability database scanner" },
                    { key: "enableDive", name: "dive", label: "Dive", description: "Layer analysis and image efficiency" },
                  ].map((scanner) => {
                    const availability = scannerAvailability.find(s => s.name === scanner.name);
                    const isAvailable = availability?.available ?? false;

                    return (
                      <div key={scanner.key} className="flex items-center space-x-2">
                        {isAvailable ? (
                          <>
                            <Checkbox
                              id={scanner.key}
                              checked={formData[scanner.key as keyof typeof formData] as boolean}
                              onCheckedChange={(checked) =>
                                handleInputChange(scanner.key, checked)
                              }
                            />
                            <div className="grid gap-1.5 leading-none">
                              <Label
                                htmlFor={scanner.key}
                                className="text-sm font-medium leading-none"
                              >
                                {scanner.label}
                              </Label>
                              <p className="text-xs text-muted-foreground">
                                {scanner.description}
                              </p>
                            </div>
                          </>
                        ) : (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center space-x-2 opacity-50">
                                <Checkbox
                                  id={scanner.key}
                                  checked={false}
                                  disabled={true}
                                />
                                <div className="grid gap-1.5 leading-none">
                                  <Label
                                    htmlFor={scanner.key}
                                    className="text-sm font-medium leading-none cursor-not-allowed"
                                  >
                                    {scanner.label}
                                  </Label>
                                  <p className="text-xs text-muted-foreground">
                                    {scanner.description}
                                  </p>
                                </div>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Disabled in server configuration</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <Button type="submit" disabled={loading} className="w-full">
                {loading ? "Starting Bulk Scan..." : "Start Bulk Scan"}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="jobs" className="space-y-4">
            <BulkScanJobsList
              jobs={jobs}
              jobsLoading={jobsLoading}
              onRefresh={fetchJobs}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
