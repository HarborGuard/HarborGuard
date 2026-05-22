"use client";

import { modalAction } from "@/lib/context-menu-utils";

import * as React from "react";
import { UnifiedTable } from "@/components/table/unified-table";
import { ColumnDefinition, ContextMenuItem } from "@/components/table/types";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  Pencil,
  Eye,
  History,
  Play,
  Plus,
  Trash2,
  Calendar,
} from "lucide-react";
import { FullPageLoading } from "@/components/ui/loading";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScheduleScanForm } from "@/components/shared/schedule-scan-form";
import { format } from "date-fns";

interface ScheduledScan {
  id: string;
  name: string;
  description?: string;
  schedule?: string;
  enabled: boolean;
  nextRunAt?: string;
  lastRunAt?: string;
  createdAt: string;
  source: string;
  imageSelectionMode: string;
  imagePattern?: string;
  selectedImages: any[];
  scanHistory: any[];
  _count: {
    selectedImages: number;
    scanHistory: number;
  };
}

export default function ScheduledScansPage() {
  const router = useRouter();
  const [loading, setLoading] = React.useState(true);
  const [scheduledScans, setScheduledScans] = React.useState<ScheduledScan[]>(
    []
  );
  const [selectedScans, setSelectedScans] = React.useState<any[]>([]);
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false);
  const [editingScan, setEditingScan] = React.useState<ScheduledScan | null>(
    null
  );

  React.useEffect(() => {
    fetchScheduledScans();
  }, []);

  const fetchScheduledScans = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/scheduled-scans");

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setScheduledScans(data.scheduledScans || []);
    } catch (error) {
      console.error("Error fetching scheduled scans:", error);
      toast.error("Failed to load scheduled scans");
    } finally {
      setLoading(false);
    }
  };

  const handleExecuteScan = async (scan: ScheduledScan) => {
    try {
      const response = await fetch(`/api/scheduled-scans/${scan.id}/execute`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to execute scan");
      }

      const result = await response.json();
      toast.success(result.message || "Scan execution started");
      fetchScheduledScans(); // Refresh the list
    } catch (error) {
      console.error("Error executing scan:", error);
      toast.error("Failed to execute scan");
    }
  };

  const handleDeleteScan = async (scan: ScheduledScan) => {
    try {
      const response = await fetch(`/api/scheduled-scans/${scan.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete scan");
      }

      toast.success("Scheduled scan deleted successfully");
      fetchScheduledScans(); // Refresh the list
    } catch (error) {
      console.error("Error deleting scan:", error);
      toast.error("Failed to delete scan");
    }
  };

  const handleToggleEnabled = async (scan: ScheduledScan) => {
    try {
      const response = await fetch(`/api/scheduled-scans/${scan.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          enabled: !scan.enabled,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update scan");
      }

      toast.success(
        scan.enabled ? "Scheduled scan disabled" : "Scheduled scan enabled"
      );
      fetchScheduledScans(); // Refresh the list
    } catch (error) {
      console.error("Error updating scan:", error);
      toast.error("Failed to update scan");
    }
  };

  const getTableColumns = (): ColumnDefinition[] => [
    {
      key: "name",
      header: "Name",
      sortable: true,
      type: "custom",
      cellProps: {
        render: (row: any) => {
          if (row.description) {
            return (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="cursor-help flex items-center gap-1">
                      <span className="text-body-sm text-foreground">{row.name}</span>
                      <span className="text-muted-foreground">ⓘ</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    <p>{row.description}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          }
          return <div className="text-body-sm text-foreground">{row.name}</div>;
        },
      },
    },
    {
      key: "enabled",
      header: "Enabled",
      sortable: true,
      type: "custom",
      cellProps: {
        render: (row: any) => (
          <Badge
            variant={row.enabled ? "default" : "secondary"}
            className={`rounded-none uppercase tracking-widest text-caption ${row.enabled ? "bg-green-900/30 text-green-400 border-green-500/30" : ""}`}
          >
            {row.enabled ? "Enabled" : "Disabled"}
          </Badge>
        ),
      },
    },
    {
      key: "imageSelectionMode",
      header: "Selection Mode",
      type: "badge",
      cellProps: {
        variant: "outline",
        label: (row: any) => {
          switch (row.imageSelectionMode) {
            case "SPECIFIC":
              return `Specific (${row._count.selectedImages})`;
            case "PATTERN":
              return `Pattern: ${row.imagePattern}`;
            case "ALL":
              return "All Images";
            case "REPOSITORY":
              return "Repository";
            default:
              return row.imageSelectionMode;
          }
        },
      },
    },
    {
      key: "schedule",
      header: "Schedule",
      type: "text",
      cellProps: {
        value: (row: any) => row.schedule || "Manual",
      },
    },
    {
      key: "lastRunAt",
      header: "Last Run",
      sortable: true,
      type: "timestamp",
      cellProps: {
        showRelative: true,
      },
    },
    {
      key: "nextRunAt",
      header: "Next Run",
      sortable: true,
      type: "timestamp",
    },
    {
      key: "_count.scanHistory",
      header: "Executions",
      sortable: true,
      type: "text",
      cellProps: {
        value: (row: any) => row._count.scanHistory.toString(),
      },
    },
    {
      key: "actions",
      header: "Actions",
      type: "custom",
      cellProps: {
        render: (row: any) => (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleExecuteScan(row);
              }}
              disabled={!row.enabled}
            >
              <Play className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/scheduled-scans/history?search=${encodeURIComponent(row.name)}`);
              }}
            >
              <History className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setEditingScan(row);
              }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteScan(row);
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ),
      },
    },
  ];

  const getContextMenuItems = (row: any): ContextMenuItem[] => [
    {
      label: "Execute Now",
      icon: <Play className="h-4 w-4" />,
      action: () => handleExecuteScan(row),
    },
    {
      label: "View Details",
      icon: <Eye className="h-4 w-4" />,
      action: modalAction(() => setEditingScan(row)),
    },
    {
      label: "View History",
      icon: <History className="h-4 w-4" />,
      action: () => router.push(`/scheduled-scans/history?search=${encodeURIComponent(row.name)}`),
    },
    {
      label: "Edit",
      icon: <Pencil className="h-4 w-4" />,
      action: modalAction(() => setEditingScan(row)),
    },
    {
      label: row.enabled ? "Disable" : "Enable",
      icon: <CalendarDays className="h-4 w-4" />,
      action: () => handleToggleEnabled(row),
    },
    {
      label: "Delete",
      icon: <Trash2 className="h-4 w-4" />,
      action: () => handleDeleteScan(row),
      variant: "destructive",
    },
  ];

  const handleRowClick = (row: any) => {
    setEditingScan(row);
  };

  if (loading) {
    return (
      <FullPageLoading
        message="Loading Scheduled Scans"
        description="Fetching scheduled scan configurations..."
      />
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-2 overflow-auto">
        <div className="flex flex-col gap-4 p-4 lg:p-6 md:gap-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-caption uppercase tracking-headline text-muted-foreground/30 mb-1">Automation</p>
              <h1 className="text-2xl tracking-tight text-foreground">Scheduled Scans</h1>
              <p className="text-caption uppercase tracking-widest text-muted-foreground/50 mt-1">
                Manage automated scanning schedules for your container images
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button className="cursor-pointer rounded-none border-white/10 hover:bg-white/5 uppercase tracking-widest text-caption" variant={"outline"} onClick={() => router.push('/scheduled-scans/history')}>
                <History className="h-4 w-4" />
                Schedule History
              </Button>
              <Button onClick={() => setCreateDialogOpen(true)} className="rounded-none uppercase tracking-widest text-caption">
                <Plus className="h-4 w-4" />
                New Schedule
              </Button>
            </div>
          </div>

          <UnifiedTable
            data={scheduledScans}
            columns={getTableColumns()}
            features={{
              sorting: true,
              filtering: true,
              pagination: true,
              selection: false,
              columnVisibility: true,
              contextMenu: true,
              search: true,
            }}
            onRowClick={handleRowClick}
            onSelectionChange={setSelectedScans}
            contextMenuItems={getContextMenuItems}
            className="bg-surface-1 border border-white/10 p-6"
          />

          {/* Create/Edit Dialog */}
          <Dialog
            open={createDialogOpen || !!editingScan}
            onOpenChange={(open) => {
              if (!open) {
                setCreateDialogOpen(false);
                setEditingScan(null);
              }
            }}
          >
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto border-white/10 rounded-none shadow-2xl p-0">
              <div className="p-8 border-b border-white/10 bg-surface-1 shrink-0">
                <DialogHeader className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Calendar className="h-4 w-4 text-accent" />
                    <DialogTitle className="text-sm uppercase tracking-wide-caps text-foreground">
                      {editingScan
                        ? "Edit Scheduled Scan"
                        : "Create Scheduled Scan"}
                    </DialogTitle>
                  </div>
                  <DialogDescription className="text-body-sm text-muted-foreground uppercase tracking-widest">
                    {editingScan
                      ? "Update the scheduled scan configuration"
                      : "Set up a new automated scan schedule for container images"}
                  </DialogDescription>
                </DialogHeader>
              </div>
              <div className="p-8">
              <ScheduleScanForm
                scan={editingScan}
                onSubmit={async (data) => {
                  try {
                    const url = editingScan
                      ? `/api/scheduled-scans/${editingScan.id}`
                      : "/api/scheduled-scans";
                    const method = editingScan ? "PUT" : "POST";

                    const response = await fetch(url, {
                      method,
                      headers: {
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify(data),
                    });

                    if (!response.ok) {
                      throw new Error("Failed to save scheduled scan");
                    }

                    toast.success(
                      editingScan
                        ? "Scheduled scan updated successfully"
                        : "Scheduled scan created successfully"
                    );
                    setCreateDialogOpen(false);
                    setEditingScan(null);
                    fetchScheduledScans();
                  } catch (error) {
                    console.error("Error saving scheduled scan:", error);
                    toast.error("Failed to save scheduled scan");
                  }
                }}
                onCancel={() => {
                  setCreateDialogOpen(false);
                  setEditingScan(null);
                }}
              />
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}
