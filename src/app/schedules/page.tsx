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
import { Plus, Clock, Play, Pause, Edit, Trash2, Calendar } from "lucide-react";
import { toast } from "sonner";
import { CreateScheduleDialog } from "@/components/schedules/CreateScheduleDialog";
import { EditScheduleDialog } from "@/components/schedules/EditScheduleDialog";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

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

export default function SchedulesPage() {
  const [schedules, setSchedules] = useState<ScanSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<ScanSchedule | null>(
    null
  );

  useEffect(() => {
    fetchSchedules();
  }, []);

  const fetchSchedules = async () => {
    try {
      const response = await fetch("/api/schedules");
      const result = await response.json();

      if (result.success) {
        setSchedules(result.data);
      } else {
        toast.error("Failed to load schedules");
      }
    } catch (error) {
      toast.error("Failed to load schedules");
      console.error("Error fetching schedules:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleSchedule = async (scheduleId: string, isActive: boolean) => {
    try {
      const response = await fetch(`/api/schedules/${scheduleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });

      const result = await response.json();

      if (result.success) {
        toast.success(`Schedule ${isActive ? "enabled" : "disabled"}`);
        fetchSchedules();
      } else {
        toast.error(result.error || "Failed to update schedule");
      }
    } catch (error) {
      toast.error("Failed to update schedule");
      console.error("Error updating schedule:", error);
    }
  };

  const deleteSchedule = async (scheduleId: string) => {
    if (!confirm("Are you sure you want to delete this schedule?")) return;

    try {
      const response = await fetch(`/api/schedules/${scheduleId}`, {
        method: "DELETE",
      });

      const result = await response.json();

      if (result.success) {
        toast.success("Schedule deleted successfully");
        fetchSchedules();
      } else {
        toast.error(result.error || "Failed to delete schedule");
      }
    } catch (error) {
      toast.error("Failed to delete schedule");
      console.error("Error deleting schedule:", error);
    }
  };

  const runScheduleNow = async (scheduleId: string) => {
    try {
      const response = await fetch(`/api/schedules/${scheduleId}/run`, {
        method: "POST",
      });

      const result = await response.json();

      if (result.success) {
        toast.success("Schedule executed successfully");
        fetchSchedules();
      } else {
        toast.error(result.error || "Failed to run schedule");
      }
    } catch (error) {
      toast.error("Failed to run schedule");
      console.error("Error running schedule:", error);
    }
  };

  const formatCronExpression = (cron: string) => {
    const cronMap: Record<string, string> = {
      "0 2 * * *": "Daily at 2 AM",
      "0 2 * * 0": "Weekly on Sunday at 2 AM",
      "0 2 1 * *": "Monthly on 1st at 2 AM",
      "0 */6 * * *": "Every 6 hours",
      "0 0 * * *": "Daily at midnight",
      "0 12 * * *": "Daily at noon",
    };

    return cronMap[cron] || cron;
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

  if (loading) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-500">Loading schedules...</p>
          </div>
        </div>
      </div>
    );
  }

  const breadcrumbs = [
    { label: "Dashboard", href: "/" },
    { label: "Schedules", href: "/schedules" },
  ];

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
                <h1 className="text-3xl font-bold">Scan Schedules</h1>
                <p className="text-gray-600 mt-1">
                  Automated recurring scans for your container images
                </p>
              </div>
              <Button
                onClick={() => setShowCreateDialog(true)}
                className="flex items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                Create Schedule
              </Button>
            </div>

            {schedules.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Calendar className="h-12 w-12 text-gray-400 mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    No schedules found
                  </h3>
                  <p className="text-gray-500 text-center mb-4">
                    Create your first scan schedule to automate security scans
                  </p>
                  <Button
                    onClick={() => setShowCreateDialog(true)}
                    variant="outline"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Create Schedule
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {schedules.map((schedule) => (
                  <Card
                    key={schedule.id}
                    className={`relative ${
                      !schedule.isActive ? "opacity-75" : ""
                    }`}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-lg flex items-center gap-2">
                            <Clock className="h-4 w-4" />
                            {schedule.name}
                          </CardTitle>
                          {schedule.description && (
                            <CardDescription className="mt-1">
                              {schedule.description}
                            </CardDescription>
                          )}
                        </div>
                        <Switch
                          checked={schedule.isActive}
                          onCheckedChange={(checked) =>
                            toggleSchedule(schedule.id, checked)
                          }
                        />
                      </div>

                      <div className="flex items-center gap-2 mt-3">
                        <Badge
                          variant={schedule.isActive ? "default" : "secondary"}
                        >
                          {schedule.isActive ? "Active" : "Inactive"}
                        </Badge>
                        <Badge variant="outline">
                          {schedule.scanRequest.type === "bulk"
                            ? "Bulk Scan"
                            : "Single Scan"}
                        </Badge>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-4">
                      <div>
                        <h4 className="font-medium text-sm text-gray-700 mb-2">
                          Schedule
                        </h4>
                        <p className="text-sm text-gray-600">
                          {formatCronExpression(schedule.cronExpression)}
                        </p>
                      </div>

                      <div>
                        <h4 className="font-medium text-sm text-gray-700 mb-2">
                          Target
                        </h4>
                        <div className="text-sm text-gray-600">
                          {schedule.scanRequest.type === "single" ? (
                            <div>
                              {schedule.scanRequest.registry && (
                                <span>{schedule.scanRequest.registry}/</span>
                              )}
                              {schedule.scanRequest.image}:
                              {schedule.scanRequest.tag || "latest"}
                            </div>
                          ) : (
                            <div className="space-y-1">
                              {schedule.scanRequest.patterns?.imagePattern && (
                                <div>
                                  Images:{" "}
                                  {schedule.scanRequest.patterns.imagePattern}
                                </div>
                              )}
                              {schedule.scanRequest.patterns?.tagPattern && (
                                <div>
                                  Tags:{" "}
                                  {schedule.scanRequest.patterns.tagPattern}
                                </div>
                              )}
                              {schedule.scanRequest.patterns
                                ?.registryPattern && (
                                <div>
                                  Registry:{" "}
                                  {
                                    schedule.scanRequest.patterns
                                      .registryPattern
                                  }
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {schedule.nextRun && schedule.isActive && (
                        <div>
                          <h4 className="font-medium text-sm text-gray-700 mb-1">
                            Next Run
                          </h4>
                          <p className="text-sm text-gray-600">
                            {new Date(schedule.nextRun).toLocaleString()}
                          </p>
                        </div>
                      )}

                      {schedule.lastRun && (
                        <div>
                          <h4 className="font-medium text-sm text-gray-700 mb-1">
                            Last Run
                          </h4>
                          <div className="flex items-center gap-2">
                            <Badge
                              className={getStatusColor(schedule.lastRunStatus)}
                            >
                              {schedule.lastRunStatus || "unknown"}
                            </Badge>
                            <span className="text-xs text-gray-500">
                              {new Date(schedule.lastRun).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      )}

                      <div className="text-xs text-gray-500">
                        Total runs: {schedule.totalRuns}
                      </div>

                      <div className="flex items-center gap-2 pt-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => runScheduleNow(schedule.id)}
                          disabled={!schedule.isActive}
                          className="flex-1"
                        >
                          <Play className="h-3 w-3 mr-1" />
                          Run Now
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingSchedule(schedule)}
                          className="text-blue-600 hover:text-blue-700"
                        >
                          <Edit className="h-3 w-3" />
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => deleteSchedule(schedule.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            <CreateScheduleDialog
              open={showCreateDialog}
              onOpenChange={setShowCreateDialog}
              onSuccess={fetchSchedules}
            />

            {editingSchedule && (
              <EditScheduleDialog
                schedule={editingSchedule}
                open={!!editingSchedule}
                onOpenChange={(open) => !open && setEditingSchedule(null)}
                onSuccess={fetchSchedules}
              />
            )}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
