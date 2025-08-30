"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Play,
  Settings,
  Filter,
  Activity,
  CheckCircle,
  XCircle,
  Clock,
  Layers2Icon,
} from "lucide-react";
import { toast } from "sonner";
import type { ScannerInfo } from "@/types";

interface BulkScanJob {
  id: string;
  name?: string;
  totalImages: number;
  status: "RUNNING" | "COMPLETED" | "FAILED" | "PAUSED";
  patterns: {
    imagePattern?: string;
    tagPattern?: string;
    registryPattern?: string;
  };
  createdAt: string;
  completedAt?: string;
  errorMessage?: string;
  _count: {
    items: number;
  };
  summary?: {
    completed: number;
    failed: number;
    running: number;
  };
}

interface BulkScanModalProps {
  children: React.ReactNode;
}

export function BulkScanModal({ children }: BulkScanModalProps) {
  const [activeTab, setActiveTab] = useState("new");
  const [jobs, setJobs] = useState<BulkScanJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [scannerAvailability, setScannerAvailability] = useState<ScannerInfo[]>([]);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    imagePattern: "",
    tagPattern: "",
    registryPattern: "",
    excludeTagPattern: "",
    maxImages: 100,
    enableTrivy: true,
    enableGrype: true,
    enableSyft: true,
    enableDockle: true,
    enableOsv: false,
    enableDive: false,
  });

  // Fetch scanner availability
  const fetchScannerAvailability = async () => {
    try {
      const response = await fetch("/api/scanners/available");
      const result = await response.json();
      
      if (result.success) {
        setScannerAvailability(result.scanners);
        
        // Update form data to pre-check available scanners
        const updatedFormData = { ...formData };
        result.scanners.forEach((scanner: ScannerInfo) => {
          const key = `enable${scanner.name.charAt(0).toUpperCase()}${scanner.name.slice(1)}`;
          // Type-safe update for boolean scanner fields
          switch(key) {
            case 'enableTrivy':
            case 'enableGrype':
            case 'enableSyft':
            case 'enableDockle':
            case 'enableOsv':
            case 'enableDive':
              updatedFormData[key] = scanner.available;
              break;
          }
        });
        setFormData(updatedFormData);
      }
    } catch (error) {
      console.error("Error fetching scanner availability:", error);
    }
  };

  // Fetch bulk scan jobs
  const fetchJobs = async () => {
    setJobsLoading(true);
    try {
      const response = await fetch("/api/scans/bulk");
      const result = await response.json();
      
      if (result.success) {
        // Get detailed status for each running job
        const jobsWithDetails = await Promise.all(
          result.data.map(async (job: BulkScanJob) => {
            if (job.status === "RUNNING") {
              try {
                const statusResponse = await fetch(`/api/scans/bulk/${job.id}`);
                const statusResult = await statusResponse.json();
                if (statusResult.success) {
                  return { ...job, summary: statusResult.data.summary };
                }
              } catch (error) {
                console.error(`Failed to fetch status for job ${job.id}:`, error);
              }
            }
            return job;
          })
        );
        
        setJobs(jobsWithDetails);
      } else {
        toast.error("Failed to fetch bulk scan jobs");
      }
    } catch (error) {
      console.error("Error fetching bulk scan jobs:", error);
      toast.error("Failed to fetch bulk scan jobs");
    } finally {
      setJobsLoading(false);
    }
  };

  // Load jobs and scanner availability when dialog opens
  useEffect(() => {
    if (open) {
      fetchJobs();
      fetchScannerAvailability();
    }
  }, [open]);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch("/api/scans/bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: formData.name.trim() || undefined,
          patterns: {
            imagePattern: formData.imagePattern.trim() || undefined,
            tagPattern: formData.tagPattern.trim() || undefined,
            registryPattern: formData.registryPattern.trim() || undefined,
            excludeTagPattern: formData.excludeTagPattern.trim() || undefined,
          },
          options: {
            maxImages: formData.maxImages,
            scanners: {
              trivy: formData.enableTrivy,
              grype: formData.enableGrype,
              syft: formData.enableSyft,
              dockle: formData.enableDockle,
              osv: formData.enableOsv,
              dive: formData.enableDive,
            },
          },
        }),
      });

      const result = await response.json();

      if (result.success) {
        toast.success(
          `Bulk scan started with ${result.data.totalImages} images`
        );
        
        // Reset form
        setFormData({
          name: "",
          imagePattern: "",
          tagPattern: "",
          registryPattern: "",
          excludeTagPattern: "",
          maxImages: 100,
          enableTrivy: true,
          enableGrype: true,
          enableSyft: true,
          enableDockle: true,
          enableOsv: false,
          enableDive: false,
        });

        // Switch to jobs tab and refresh
        setActiveTab("jobs");
        fetchJobs();
      } else {
        toast.error(result.error || "Failed to start bulk scan");
      }
    } catch (error) {
      console.error("Error starting bulk scan:", error);
      toast.error("Failed to start bulk scan");
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "RUNNING":
        return <Activity className="h-4 w-4 text-blue-500 animate-pulse" />;
      case "COMPLETED":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "FAILED":
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "RUNNING":
        return "bg-blue-100 text-blue-800";
      case "COMPLETED":
        return "bg-green-100 text-green-800";
      case "FAILED":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
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
            <form onSubmit={handleSubmit} className="space-y-4">
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
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Active Bulk Scan Jobs</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchJobs}
                disabled={jobsLoading}
              >
                {jobsLoading ? "Refreshing..." : "Refresh"}
              </Button>
            </div>

            {jobs.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-8">
                  <Activity className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold">No Active Jobs</h3>
                  <p className="text-muted-foreground text-center">
                    Start a new bulk scan to see job progress here
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {jobs.map((job) => (
                  <Card key={job.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">
                          {job.name || `Bulk Scan ${job.id.slice(0, 8)}`}
                        </CardTitle>
                        <div className="flex items-center gap-2">
                          {getStatusIcon(job.status)}
                          <Badge className={getStatusColor(job.status)}>
                            {job.status}
                          </Badge>
                        </div>
                      </div>
                      <CardDescription>
                        {job.totalImages} images • Started{" "}
                        {new Date(job.createdAt).toLocaleDateString()}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {job.summary && job.status === "RUNNING" && (
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>Progress</span>
                            <span>
                              {job.summary.completed + job.summary.failed} /{" "}
                              {job.totalImages}
                            </span>
                          </div>
                          <Progress
                            value={
                              ((job.summary.completed + job.summary.failed) /
                                job.totalImages) *
                              100
                            }
                            className="w-full"
                          />
                          <div className="flex gap-4 text-xs text-muted-foreground">
                            <span>✓ {job.summary.completed} completed</span>
                            <span>✗ {job.summary.failed} failed</span>
                            <span>⏳ {job.summary.running} running</span>
                          </div>
                        </div>
                      )}

                      {job.status === "FAILED" && job.errorMessage && (
                        <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
                          {job.errorMessage}
                        </div>
                      )}

                      {job.status === "COMPLETED" && (
                        <div className="text-sm text-green-600">
                          Completed {job.completedAt && new Date(job.completedAt).toLocaleDateString()}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}