"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
} from "lucide-react";
import { toast } from "sonner";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

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

export default function BulkScanPage() {
  const [activeTab, setActiveTab] = useState("new");
  const [jobs, setJobs] = useState<BulkScanJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [jobsLoading, setJobsLoading] = useState(false);

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
                  return { ...job, ...statusResult.data };
                }
              } catch (error) {
                console.warn(`Failed to get status for job ${job.id}:`, error);
              }
            }
            return job;
          })
        );
        setJobs(jobsWithDetails);
      } else {
        toast.error("Failed to load bulk scan jobs");
      }
    } catch (error) {
      console.error("Error fetching bulk scan jobs:", error);
      toast.error("Failed to load bulk scan jobs");
    } finally {
      setJobsLoading(false);
    }
  };

  // Fetch jobs on component mount and when switching to jobs tab
  useEffect(() => {
    if (activeTab === "jobs") {
      fetchJobs();
    }
  }, [activeTab]);

  // Poll for updates every 5 seconds when on jobs tab and there are running jobs
  useEffect(() => {
    if (activeTab === "jobs" && jobs.some((job) => job.status === "RUNNING")) {
      const interval = setInterval(fetchJobs, 5000);
      return () => clearInterval(interval);
    }
  }, [activeTab, jobs]);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    imagePattern: "",
    tagPattern: "",
    registryPattern: "",
    excludePatterns: [] as string[],
    maxConcurrent: 3,
    templateId: "none",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (
      !formData.imagePattern &&
      !formData.tagPattern &&
      !formData.registryPattern
    ) {
      toast.error("Please specify at least one search pattern");
      return;
    }

    setLoading(true);

    try {
      const payload = {
        name: formData.name || `Bulk scan ${new Date().toLocaleString()}`,
        type: "bulk" as const,
        patterns: {
          ...(formData.imagePattern && { imagePattern: formData.imagePattern }),
          ...(formData.tagPattern && { tagPattern: formData.tagPattern }),
          ...(formData.registryPattern && {
            registryPattern: formData.registryPattern,
          }),
        },
        excludePatterns: formData.excludePatterns.filter((p) => p.length > 0),
        maxConcurrent: formData.maxConcurrent,
        ...(formData.templateId &&
          formData.templateId !== "none" && {
            scanTemplate: formData.templateId,
          }),
      };

      const response = await fetch("/api/scans/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || "Failed to start bulk scan");
      }

      const result = await response.json();
      toast.success(`Bulk scan started for ${result.data.totalImages} images`);

      // Switch to jobs tab and refresh to show new job
      setActiveTab("jobs");
      setTimeout(fetchJobs, 1000); // Small delay to allow job to be created

      // Reset form
      setFormData({
        name: "",
        imagePattern: "",
        tagPattern: "",
        registryPattern: "",
        excludePatterns: [],
        maxConcurrent: 3,
        templateId: "none",
      });
    } catch (error) {
      console.error("Bulk scan failed:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to start bulk scan"
      );
    } finally {
      setLoading(false);
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
      case "PAUSED":
        return "bg-yellow-100 text-yellow-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "RUNNING":
        return <Activity className="h-4 w-4" />;
      case "COMPLETED":
        return <CheckCircle className="h-4 w-4" />;
      case "FAILED":
        return <XCircle className="h-4 w-4" />;
      case "PAUSED":
        return <Clock className="h-4 w-4" />;
      default:
        return null;
    }
  };

  const breadcrumbs = [{ label: "Dashboard", href: "/" }, { label: "Build Scan", href: "/bulk-scan" }];

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" />
      <SidebarInset className="flex flex-col">
        <SiteHeader breadcrumbs={breadcrumbs} />
        <div className="flex-1 overflow-auto">
          <div className="@container/main flex flex-col gap-2 p-4 lg:p-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold">Bulk Scan</h1>
                <p className="text-gray-600 mt-1">
                  Scan multiple container images using pattern matching
                </p>
              </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="new" className="flex items-center gap-2">
                  <Play className="h-4 w-4" />
                  New Bulk Scan
                </TabsTrigger>
                <TabsTrigger value="jobs" className="flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  Scan Jobs
                </TabsTrigger>
              </TabsList>

              <TabsContent value="new" className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Filter className="h-5 w-5" />
                      Pattern Configuration
                    </CardTitle>
                    <CardDescription>
                      Define patterns to match multiple images. Use * as
                      wildcard.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-6">
                      <div>
                        <Label htmlFor="name">Scan Name (optional)</Label>
                        <Input
                          id="name"
                          value={formData.name}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              name: e.target.value,
                            }))
                          }
                          placeholder="e.g., Production Images Scan"
                        />
                      </div>

                      <div className="grid gap-4 md:grid-cols-3">
                        <div>
                          <Label htmlFor="imagePattern">Image Pattern</Label>
                          <Input
                            id="imagePattern"
                            value={formData.imagePattern}
                            onChange={(e) =>
                              setFormData((prev) => ({
                                ...prev,
                                imagePattern: e.target.value,
                              }))
                            }
                            placeholder="e.g., nginx*, *app*, ubuntu"
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            Match image names
                          </p>
                        </div>
                        <div>
                          <Label htmlFor="tagPattern">Tag Pattern</Label>
                          <Input
                            id="tagPattern"
                            value={formData.tagPattern}
                            onChange={(e) =>
                              setFormData((prev) => ({
                                ...prev,
                                tagPattern: e.target.value,
                              }))
                            }
                            placeholder="e.g., latest, v*, *-prod"
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            Match image tags
                          </p>
                        </div>
                        <div>
                          <Label htmlFor="registryPattern">
                            Registry Pattern
                          </Label>
                          <Input
                            id="registryPattern"
                            value={formData.registryPattern}
                            onChange={(e) =>
                              setFormData((prev) => ({
                                ...prev,
                                registryPattern: e.target.value,
                              }))
                            }
                            placeholder="e.g., docker.io, *.company.com"
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            Match registries
                          </p>
                        </div>
                      </div>

                      <div>
                        <Label htmlFor="excludePatterns">
                          Exclude Patterns (one per line)
                        </Label>
                        <textarea
                          className="w-full mt-1 p-2 border rounded-md"
                          rows={4}
                          value={formData.excludePatterns.join("\n")}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              excludePatterns: e.target.value
                                .split("\n")
                                .filter(Boolean),
                            }))
                          }
                          placeholder="*:debug&#10;test/*&#10;*-temp&#10;*/old*"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Images matching these patterns will be excluded
                        </p>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <Label htmlFor="maxConcurrent">
                            Max Concurrent Scans
                          </Label>
                          <Select
                            value={formData.maxConcurrent.toString()}
                            onValueChange={(value) =>
                              setFormData((prev) => ({
                                ...prev,
                                maxConcurrent: parseInt(value),
                              }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                                <SelectItem key={num} value={num.toString()}>
                                  {num}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-gray-500 mt-1">
                            Number of parallel scans
                          </p>
                        </div>

                        <div>
                          <Label htmlFor="template">
                            Scan Template (optional)
                          </Label>
                          <Select
                            value={formData.templateId}
                            onValueChange={(value) =>
                              setFormData((prev) => ({
                                ...prev,
                                templateId: value,
                              }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Choose a template" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">No template</SelectItem>
                              {/* Templates would be loaded here */}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-4 border-t">
                        <div className="text-sm text-gray-600">
                          At least one pattern is required to start bulk scan
                        </div>
                        <Button
                          type="submit"
                          disabled={
                            loading ||
                            (!formData.imagePattern &&
                              !formData.tagPattern &&
                              !formData.registryPattern)
                          }
                          className="flex items-center gap-2"
                        >
                          <Play className="h-4 w-4" />
                          {loading ? "Starting..." : "Start Bulk Scan"}
                        </Button>
                      </div>
                    </form>
                  </CardContent>
                </Card>

                <Card className="bg-blue-50 border-blue-200">
                  <CardContent className="p-4">
                    <h4 className="font-medium text-sm mb-2">
                      Pattern Examples
                    </h4>
                    <div className="text-sm space-y-2">
                      <div>
                        <code className="bg-white px-2 py-1 rounded">
                          nginx*
                        </code>{" "}
                        - Matches nginx, nginx-alpine, nginx-proxy
                      </div>
                      <div>
                        <code className="bg-white px-2 py-1 rounded">
                          *app*
                        </code>{" "}
                        - Matches myapp, webapp, app-server
                      </div>
                      <div>
                        <code className="bg-white px-2 py-1 rounded">v1.*</code>{" "}
                        - Matches v1.0, v1.2.3, v1.beta
                      </div>
                      <div>
                        <code className="bg-white px-2 py-1 rounded">
                          *.prod
                        </code>{" "}
                        - Matches stable.prod, release.prod
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="jobs" className="space-y-6">
                {jobsLoading && jobs.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                      <p className="text-gray-500">Loading jobs...</p>
                    </CardContent>
                  </Card>
                ) : jobs.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <Activity className="h-12 w-12 text-gray-400 mb-4" />
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">
                        No bulk scan jobs
                      </h3>
                      <p className="text-gray-500 text-center mb-4">
                        Start your first bulk scan to see job progress here
                      </p>
                      <Button
                        onClick={() => setActiveTab("new")}
                        variant="outline"
                      >
                        <Play className="h-4 w-4 mr-2" />
                        Start Bulk Scan
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-4">
                    {jobs.map((job) => (
                      <Card key={job.id}>
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between">
                            <div>
                              <CardTitle className="text-lg flex items-center gap-2">
                                {getStatusIcon(job.status)}
                                {job.name || `Bulk Scan ${job.id.slice(0, 8)}`}
                              </CardTitle>
                              <CardDescription>
                                Started{" "}
                                {new Date(job.createdAt).toLocaleString()}
                              </CardDescription>
                            </div>
                            <Badge className={getStatusColor(job.status)}>
                              {job.status}
                            </Badge>
                          </div>
                        </CardHeader>

                        <CardContent className="space-y-4">
                          <div>
                            <div className="flex items-center justify-between text-sm mb-2">
                              <span>Progress</span>
                              <span>
                                {job.summary?.completed || 0}/{job.totalImages} images
                              </span>
                            </div>
                            <Progress
                              value={
                                job.totalImages > 0 
                                  ? ((job.summary?.completed || 0) / job.totalImages) * 100
                                  : 0
                              }
                              className="w-full"
                            />
                          </div>

                          <div className="grid gap-4 md:grid-cols-3 text-sm">
                            <div>
                              <span className="text-gray-600">
                                Total Images:
                              </span>
                              <div className="font-medium">
                                {job.totalImages}
                              </div>
                            </div>
                            <div>
                              <span className="text-gray-600">Completed:</span>
                              <div className="font-medium text-green-600">
                                {job.summary?.completed || 0}
                              </div>
                            </div>
                            <div>
                              <span className="text-gray-600">Failed:</span>
                              <div className="font-medium text-red-600">
                                {job.summary?.failed || 0}
                              </div>
                            </div>
                          </div>

                          <div>
                            <h4 className="font-medium text-sm text-gray-700 mb-2">
                              Patterns
                            </h4>
                            <div className="flex flex-wrap gap-2">
                              {job.patterns.imagePattern && (
                                <Badge variant="outline">
                                  Image: {job.patterns.imagePattern}
                                </Badge>
                              )}
                              {job.patterns.tagPattern && (
                                <Badge variant="outline">
                                  Tag: {job.patterns.tagPattern}
                                </Badge>
                              )}
                              {job.patterns.registryPattern && (
                                <Badge variant="outline">
                                  Registry: {job.patterns.registryPattern}
                                </Badge>
                              )}
                            </div>
                          </div>


                          <div className="flex items-center justify-between pt-2 border-t">
                            <div className="text-xs text-gray-500">
                              Created: {new Date(job.createdAt).toLocaleDateString()}
                            </div>
                            <div className="flex gap-2">
                              {job.status === "RUNNING" && (
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  onClick={async () => {
                                    try {
                                      const response = await fetch(`/api/scans/bulk/${job.id}/cancel`, {
                                        method: 'POST'
                                      });
                                      if (response.ok) {
                                        toast.success('Bulk scan cancelled');
                                        fetchJobs();
                                      } else {
                                        toast.error('Failed to cancel bulk scan');
                                      }
                                    } catch (error) {
                                      toast.error('Failed to cancel bulk scan');
                                    }
                                  }}
                                >
                                  Cancel
                                </Button>
                              )}
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => window.open(`/bulk-scan/${job.id}`, '_blank')}
                              >
                                View Details
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
