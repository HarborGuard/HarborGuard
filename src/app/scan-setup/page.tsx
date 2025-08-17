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
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Plus, 
  Settings, 
  Play, 
  Pause, 
  Edit, 
  Trash2, 
  Clock, 
  Calendar,
  FileText,
  Timer
} from "lucide-react";
import { toast } from "sonner";
import { CreateTemplateDialog } from "@/components/templates/CreateTemplateDialog";
import { EditTemplateDialog } from "@/components/templates/EditTemplateDialog";
import { CreateScheduleDialog } from "@/components/schedules/CreateScheduleDialog";
import { EditScheduleDialog } from "@/components/schedules/EditScheduleDialog";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

interface ScanTemplate {
  id: string;
  name: string;
  description?: string;
  environment: "production" | "staging" | "development" | "any";
  scannerConfig: {
    scanners: string[];
    failOnHigh?: boolean;
    timeout?: number;
    cacheEnabled?: boolean;
    parallelScans?: boolean;
  };
  policyConfig?: {
    maxCritical: number;
    maxHigh: number;
    maxMedium?: number;
    complianceRequired: boolean;
    generateReport?: boolean;
  };
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ScanSchedule {
  id: string;
  name: string;
  description?: string;
  cronExpression: string;
  isActive: boolean;
  scanRequest: {
    type: "single" | "bulk";
    image?: string;
    tag?: string;
    registry?: string;
    patterns?: {
      imagePattern?: string;
      tagPattern?: string;
      registryPattern?: string;
    };
    excludePatterns?: string[];
    maxConcurrent?: number;
    scanTemplate?: string;
  };
  nextRun?: string;
  lastRun?: string;
  lastRunStatus?: "success" | "failed" | "running";
  totalRuns: number;
  createdAt: string;
  updatedAt: string;
}

export default function ScanSetupPage() {
  // Templates state
  const [templates, setTemplates] = useState<ScanTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [selectedEnvironment, setSelectedEnvironment] = useState<string>("all");
  const [showCreateTemplateDialog, setShowCreateTemplateDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ScanTemplate | null>(null);

  // Schedules state
  const [schedules, setSchedules] = useState<ScanSchedule[]>([]);
  const [schedulesLoading, setSchedulesLoading] = useState(true);
  const [showCreateScheduleDialog, setShowCreateScheduleDialog] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<ScanSchedule | null>(null);

  const breadcrumbs = [
    { label: "Dashboard", href: "/" },
    { label: "Scan Setup" },
  ];

  // Fetch templates
  const fetchTemplates = async () => {
    setTemplatesLoading(true);
    try {
      const response = await fetch("/api/templates");
      const result = await response.json();
      
      if (result.success) {
        setTemplates(result.data);
      } else {
        toast.error("Failed to fetch templates");
      }
    } catch (error) {
      console.error("Error fetching templates:", error);
      toast.error("Failed to fetch templates");
    } finally {
      setTemplatesLoading(false);
    }
  };

  // Fetch schedules
  const fetchSchedules = async () => {
    setSchedulesLoading(true);
    try {
      const response = await fetch("/api/schedules");
      const result = await response.json();
      
      if (result.success) {
        setSchedules(result.data);
      } else {
        toast.error("Failed to fetch schedules");
      }
    } catch (error) {
      console.error("Error fetching schedules:", error);
      toast.error("Failed to fetch schedules");
    } finally {
      setSchedulesLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
    fetchSchedules();
  }, []);

  // Template handlers
  const handleDeleteTemplate = async (id: string) => {
    if (!confirm("Are you sure you want to delete this template?")) return;

    try {
      const response = await fetch(`/api/templates/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        toast.success("Template deleted successfully");
        fetchTemplates();
      } else {
        toast.error("Failed to delete template");
      }
    } catch (error) {
      console.error("Error deleting template:", error);
      toast.error("Failed to delete template");
    }
  };

  const handleSetDefaultTemplate = async (id: string) => {
    try {
      const response = await fetch(`/api/templates/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ isDefault: true }),
      });

      if (response.ok) {
        toast.success("Default template updated");
        fetchTemplates();
      } else {
        toast.error("Failed to update default template");
      }
    } catch (error) {
      console.error("Error updating template:", error);
      toast.error("Failed to update template");
    }
  };

  // Schedule handlers
  const handleToggleSchedule = async (id: string, isActive: boolean) => {
    try {
      const response = await fetch(`/api/schedules/${id}/toggle`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ isActive }),
      });

      if (response.ok) {
        toast.success(`Schedule ${isActive ? "activated" : "deactivated"}`);
        fetchSchedules();
      } else {
        toast.error("Failed to toggle schedule");
      }
    } catch (error) {
      console.error("Error toggling schedule:", error);
      toast.error("Failed to toggle schedule");
    }
  };

  const handleRunSchedule = async (id: string) => {
    try {
      const response = await fetch(`/api/schedules/${id}/run`, {
        method: "POST",
      });

      if (response.ok) {
        toast.success("Schedule triggered successfully");
        fetchSchedules();
      } else {
        toast.error("Failed to run schedule");
      }
    } catch (error) {
      console.error("Error running schedule:", error);
      toast.error("Failed to run schedule");
    }
  };

  const handleDeleteSchedule = async (id: string) => {
    if (!confirm("Are you sure you want to delete this schedule?")) return;

    try {
      const response = await fetch(`/api/schedules/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        toast.success("Schedule deleted successfully");
        fetchSchedules();
      } else {
        toast.error("Failed to delete schedule");
      }
    } catch (error) {
      console.error("Error deleting schedule:", error);
      toast.error("Failed to delete schedule");
    }
  };

  // Filter templates by environment
  const filteredTemplates = templates.filter((template) =>
    selectedEnvironment === "all" || template.environment === selectedEnvironment
  );

  const getEnvironmentColor = (environment: string) => {
    switch (environment) {
      case "production":
        return "bg-red-100 text-red-800";
      case "staging":
        return "bg-yellow-100 text-yellow-800";
      case "development":
        return "bg-green-100 text-green-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case "success":
        return "bg-green-100 text-green-800";
      case "failed":
        return "bg-red-100 text-red-800";
      case "running":
        return "bg-blue-100 text-blue-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const formatCronExpression = (cron: string) => {
    // Basic cron expression formatting
    const parts = cron.split(" ");
    if (parts.length !== 5) return cron;

    const [minute, hour, day, month, weekday] = parts;
    
    if (minute === "0" && hour !== "*") {
      return `Daily at ${hour}:00`;
    }
    if (minute !== "*" && hour !== "*") {
      return `Daily at ${hour}:${minute.padStart(2, "0")}`;
    }
    return cron;
  };

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
          <div className="@container/main flex flex-col gap-4 p-4 lg:p-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-semibold flex items-center gap-2">
                  <Settings className="h-6 w-6" />
                  Scan Setup
                </h1>
                <p className="text-muted-foreground">
                  Manage scan templates and schedules for automated security scanning
                </p>
              </div>
            </div>

            <Tabs defaultValue="templates" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="templates" className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Templates
                </TabsTrigger>
                <TabsTrigger value="schedules" className="flex items-center gap-2">
                  <Timer className="h-4 w-4" />
                  Schedules
                </TabsTrigger>
              </TabsList>

              {/* Templates Tab */}
              <TabsContent value="templates" className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">Scan Templates</h2>
                    <p className="text-sm text-muted-foreground">
                      Create reusable scanning configurations for different environments
                    </p>
                  </div>
                  <Button onClick={() => setShowCreateTemplateDialog(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    New Template
                  </Button>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant={selectedEnvironment === "all" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedEnvironment("all")}
                  >
                    All
                  </Button>
                  <Button
                    variant={selectedEnvironment === "production" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedEnvironment("production")}
                  >
                    Production
                  </Button>
                  <Button
                    variant={selectedEnvironment === "staging" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedEnvironment("staging")}
                  >
                    Staging
                  </Button>
                  <Button
                    variant={selectedEnvironment === "development" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedEnvironment("development")}
                  >
                    Development
                  </Button>
                </div>

                {templatesLoading ? (
                  <div>Loading templates...</div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {filteredTemplates.map((template) => (
                      <Card key={template.id} className="relative">
                        <CardHeader className="pb-2">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-base">{template.name}</CardTitle>
                            {template.isDefault && (
                              <Badge variant="default">Default</Badge>
                            )}
                          </div>
                          <CardDescription>{template.description}</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">Environment</span>
                              <Badge className={getEnvironmentColor(template.environment)}>
                                {template.environment}
                              </Badge>
                            </div>
                            
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">Scanners</span>
                              <span className="text-sm">
                                {template.scannerConfig.scanners.length} enabled
                              </span>
                            </div>

                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEditingTemplate(template)}
                              >
                                <Edit className="h-3 w-3 mr-1" />
                                Edit
                              </Button>
                              {!template.isDefault && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleSetDefaultTemplate(template.id)}
                                >
                                  Set Default
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDeleteTemplate(template.id)}
                                className="text-red-600 hover:text-red-800"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* Schedules Tab */}
              <TabsContent value="schedules" className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">Scan Schedules</h2>
                    <p className="text-sm text-muted-foreground">
                      Automate scans with cron-based scheduling
                    </p>
                  </div>
                  <Button onClick={() => setShowCreateScheduleDialog(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    New Schedule
                  </Button>
                </div>

                {schedulesLoading ? (
                  <div>Loading schedules...</div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {schedules.map((schedule) => (
                      <Card key={schedule.id}>
                        <CardHeader className="pb-2">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-base">{schedule.name}</CardTitle>
                            <Switch
                              checked={schedule.isActive}
                              onCheckedChange={(checked) =>
                                handleToggleSchedule(schedule.id, checked)
                              }
                            />
                          </div>
                          <CardDescription>{schedule.description}</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">Schedule</span>
                              <span className="text-sm">
                                {formatCronExpression(schedule.cronExpression)}
                              </span>
                            </div>

                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">Type</span>
                              <Badge variant="outline">
                                {schedule.scanRequest.type}
                              </Badge>
                            </div>

                            {schedule.nextRun && (
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">Next Run</span>
                                <span className="text-sm">
                                  {new Date(schedule.nextRun).toLocaleDateString()}
                                </span>
                              </div>
                            )}

                            {schedule.lastRun && (
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">Last Run</span>
                                <div className="flex items-center gap-2">
                                  <Badge className={getStatusColor(schedule.lastRunStatus)}>
                                    {schedule.lastRunStatus}
                                  </Badge>
                                  <span className="text-xs text-muted-foreground">
                                    {new Date(schedule.lastRun).toLocaleDateString()}
                                  </span>
                                </div>
                              </div>
                            )}

                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleRunSchedule(schedule.id)}
                                disabled={!schedule.isActive}
                              >
                                <Play className="h-3 w-3 mr-1" />
                                Run Now
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEditingSchedule(schedule)}
                              >
                                <Edit className="h-3 w-3 mr-1" />
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDeleteSchedule(schedule.id)}
                                className="text-red-600 hover:text-red-800"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>

                            <div className="text-xs text-muted-foreground">
                              Total runs: {schedule.totalRuns}
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

      {/* Template Dialogs */}
      <CreateTemplateDialog
        open={showCreateTemplateDialog}
        onOpenChange={setShowCreateTemplateDialog}
        onSuccess={fetchTemplates}
      />

      {editingTemplate && (
        <EditTemplateDialog
          open={!!editingTemplate}
          onOpenChange={(open) => !open && setEditingTemplate(null)}
          template={editingTemplate}
          onSuccess={fetchTemplates}
        />
      )}

      {/* Schedule Dialogs */}
      <CreateScheduleDialog
        open={showCreateScheduleDialog}
        onOpenChange={setShowCreateScheduleDialog}
        onSuccess={fetchSchedules}
      />

      {editingSchedule && (
        <EditScheduleDialog
          open={!!editingSchedule}
          onOpenChange={(open) => !open && setEditingSchedule(null)}
          schedule={editingSchedule}
          onSuccess={fetchSchedules}
        />
      )}
    </SidebarProvider>
  );
}