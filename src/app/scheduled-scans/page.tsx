"use client";

import * as React from "react";
import { UnifiedTable } from "@/components/table/unified-table";
import { ColumnDefinition, ContextMenuItem } from "@/components/table/types";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  IconCalendarEvent,
  IconEdit,
  IconEye,
  IconHistory,
  IconPlayerPlay,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
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
import { ScheduleScanForm } from "@/components/schedule-scan-form";
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
  const [scheduledScans, setScheduledScans] = React.useState<ScheduledScan[]>([]);
  const [selectedScans, setSelectedScans] = React.useState<any[]>([]);
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false);
  const [editingScan, setEditingScan] = React.useState<ScheduledScan | null>(null);

  React.useEffect(() => {
    fetchScheduledScans();
  }, []);

  const fetchScheduledScans = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/scheduled-scans");
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
        scan.enabled
          ? "Scheduled scan disabled"
          : "Scheduled scan enabled"
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
                    <div className="font-medium cursor-help flex items-center gap-1">
                      <span>{row.name}</span>
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
          return <div className="font-medium">{row.name}</div>;
        },
      },
    },
    {
      key: "enabled",
      header: "Status",
      sortable: true,
      type: "custom",
      cellProps: {
        render: (row: any) => (
          <Badge
            variant={row.enabled ? "default" : "secondary"}
            className={row.enabled ? "bg-green-500 hover:bg-green-600" : ""}
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
              <IconPlayerPlay className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/scheduled-scans/${row.id}/history`);
              }}
            >
              <IconHistory className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setEditingScan(row);
              }}
            >
              <IconEdit className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteScan(row);
              }}
            >
              <IconTrash className="h-4 w-4" />
            </Button>
          </div>
        ),
      },
    },
  ];

  const getContextMenuItems = (row: any): ContextMenuItem[] => [
    {
      label: "Execute Now",
      icon: <IconPlayerPlay className="h-4 w-4" />,
      action: () => handleExecuteScan(row),
    },
    {
      label: "View Details",
      icon: <IconEye className="h-4 w-4" />,
      action: () => router.push(`/scheduled-scans/${row.id}`),
    },
    {
      label: "View History",
      icon: <IconHistory className="h-4 w-4" />,
      action: () => router.push(`/scheduled-scans/${row.id}/history`),
    },
    {
      label: "Edit",
      icon: <IconEdit className="h-4 w-4" />,
      action: () => setEditingScan(row),
    },
    {
      label: row.enabled ? "Disable" : "Enable",
      icon: <IconCalendarEvent className="h-4 w-4" />,
      action: () => handleToggleEnabled(row),
    },
    {
      label: "Delete",
      icon: <IconTrash className="h-4 w-4" />,
      action: () => handleDeleteScan(row),
      variant: "destructive",
    },
  ];

  const handleRowClick = (row: any) => {
    router.push(`/scheduled-scans/${row.id}`);
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
              <h1 className="text-2xl font-semibold">Scheduled Scans</h1>
              <p className="text-sm text-muted-foreground">
                Manage automated scanning schedules for your container images
              </p>
            </div>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <IconPlus className="mr-2 h-4 w-4" />
              New Schedule
            </Button>
          </div>

          <UnifiedTable
            data={scheduledScans}
            columns={getTableColumns()}
            features={{
              sorting: true,
              filtering: true,
              pagination: true,
              selection: true,
              columnVisibility: true,
              contextMenu: true,
              search: true,
            }}
            onRowClick={handleRowClick}
            onSelectionChange={setSelectedScans}
            contextMenuItems={getContextMenuItems}
            className="bg-card rounded-lg border shadow-xs p-6"
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
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingScan ? "Edit Scheduled Scan" : "Create Scheduled Scan"}
                </DialogTitle>
                <DialogDescription>
                  {editingScan
                    ? "Update the scheduled scan configuration"
                    : "Set up a new automated scan schedule for container images"}
                </DialogDescription>
              </DialogHeader>
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
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}