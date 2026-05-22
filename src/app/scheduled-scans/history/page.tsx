"use client";

import { modalAction } from "@/lib/context-menu-utils";

import * as React from "react";
import { Suspense } from "react";
import { UnifiedTable } from "@/components/table/unified-table";
import { ColumnDefinition, ContextMenuItem } from "@/components/table/types";
import { toast } from "sonner";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Eye,
  Info,
  AlertTriangle,
  Check,
  X,
  Clock,
  FileText,
} from "lucide-react";
import { FullPageLoading } from "@/components/ui/loading";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface HistoricalScan {
  id: string;
  scheduledScanId: string;
  executionId: string;
  startedAt: string;
  completedAt?: string;
  status: string;
  totalImages: number;
  scannedImages: number;
  failedImages: number;
  errorMessage?: string;
  triggerSource: string;
  triggeredBy?: string;
  auditInfo?: any;
  scheduledScan: {
    id: string;
    name: string;
    description?: string;
    imageSelectionMode: string;
  };
  scanResults?: Array<{
    id: string;
    status: string;
    scanId?: string;
    imageName?: string;
    imageTag?: string;
    scan?: any;
  }>;
  vulnerabilityStats: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  scanStats: {
    success: number;
    failed: number;
    pending: number;
  };
  _count: {
    scanResults: number;
  };
}

function ScheduledScansHistoryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = React.useState(true);
  const [history, setHistory] = React.useState<HistoricalScan[]>([]);
  const [selectedHistory, setSelectedHistory] = React.useState<HistoricalScan | null>(null);
  const [auditModalOpen, setAuditModalOpen] = React.useState(false);

  // Get initial search value from URL params
  const initialSearch = searchParams.get('search') || '';

  React.useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/scheduled-scans/history?limit=100");
      const data = await response.json();
      setHistory(data.history || []);
    } catch (error) {
      console.error("Error fetching history:", error);
      toast.error("Failed to load scan history");
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "COMPLETED":
        return Check;
      case "FAILED":
        return X;
      case "RUNNING":
        return Clock;
      case "PARTIAL":
        return AlertTriangle;
      default:
        return Clock;
    }
  };

  const getStatusVariant = (status: string): any => {
    switch (status) {
      case "COMPLETED":
        return "default";
      case "FAILED":
        return "destructive";
      case "RUNNING":
        return "secondary";
      case "PARTIAL":
        return "outline";
      default:
        return "secondary";
    }
  };

  const getDuration = (start: string, end?: string) => {
    const startTime = new Date(start).getTime();
    const endTime = end ? new Date(end).getTime() : Date.now();
    const duration = endTime - startTime;

    const seconds = Math.floor(duration / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const getTableColumns = (): ColumnDefinition[] => [
    {
      key: "scheduledScan.name",
      header: "Schedule Name",
      sortable: true,
      type: "text",
      cellProps: {
        className: "text-body-sm text-foreground",
        value: (row: any) => row.scheduledScan?.name || "Unknown",
      },
    },
    {
      key: "executionId",
      header: "Execution ID",
      type: "text",
      cellProps: {
        className: "font-mono text-caption uppercase tracking-widest",
        value: (row: any) => row.executionId.substring(0, 8),
      },
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      type: "badge",
      cellProps: {
        variant: (row: any) => getStatusVariant(row.status),
        label: (row: any) => row.status,
        icon: (row: any) => getStatusIcon(row.status),
      },
    },
    {
      key: "progress",
      header: "Progress",
      type: "custom",
      cellProps: {
        render: (row: any) => (
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-body-sm">
              <span className="text-foreground">{row.scannedImages}</span>
              <span className="text-muted-foreground/40">/</span>
              <span className="text-foreground">{row.totalImages}</span>
              {row.failedImages > 0 && (
                <Badge variant="destructive" className="rounded-none uppercase tracking-widest text-caption">
                  {row.failedImages} failed
                </Badge>
              )}
            </div>
            <Progress
              value={(row.scannedImages / row.totalImages) * 100}
              className="h-2"
            />
          </div>
        ),
      },
    },
    {
      key: "vulnerabilities",
      header: "Vulnerabilities",
      type: "custom",
      cellProps: {
        render: (row: any) => (
          <div className="flex items-center gap-2">
            {row.vulnerabilityStats.critical > 0 && (
              <Badge variant="destructive" className="rounded-none uppercase tracking-widest text-caption">
                {row.vulnerabilityStats.critical} Critical
              </Badge>
            )}
            {row.vulnerabilityStats.high > 0 && (
              <Badge className="rounded-none uppercase tracking-widest text-caption bg-orange-900/30 text-orange-400 border-orange-500/30">
                {row.vulnerabilityStats.high} High
              </Badge>
            )}
            {row.vulnerabilityStats.medium > 0 && (
              <Badge variant="outline" className="rounded-none uppercase tracking-widest text-caption border-white/10">
                {row.vulnerabilityStats.medium} Medium
              </Badge>
            )}
          </div>
        ),
      },
    },
    {
      key: "triggerSource",
      header: "Trigger",
      type: "badge",
      cellProps: {
        variant: "outline",
      },
    },
    {
      key: "startedAt",
      header: "Started",
      sortable: true,
      type: "timestamp",
      cellProps: {
        showRelative: true,
      },
    },
    {
      key: "duration",
      header: "Duration",
      type: "text",
      cellProps: {
        value: (row: any) => getDuration(row.startedAt, row.completedAt),
      },
    },
  ];

  const getContextMenuItems = (row: any): ContextMenuItem[] => [
    {
      label: "View Scan Results",
      icon: <Eye className="h-4 w-4" />,
      action: () => {
        // Navigate to the image scan detail page
        if (row.scanResults && row.scanResults.length > 0) {
          const firstResult = row.scanResults[0];
          if (firstResult.scanId && firstResult.imageName) {
            router.push(`/images/${encodeURIComponent(firstResult.imageName)}/${firstResult.scanId}`);
          }
        }
      },
    },
    {
      label: "View Audit Info",
      icon: <Info className="h-4 w-4" />,
      action: modalAction(() => {
        setSelectedHistory(row);
        setAuditModalOpen(true);
      }),
    },
  ];

  if (loading) {
    return (
      <FullPageLoading
        message="Loading Scan History"
        description="Fetching historical scan execution records..."
      />
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-2 overflow-auto">
        <div className="flex flex-col gap-4 p-4 lg:p-6 md:gap-6">
          <div>
            <p className="text-caption uppercase tracking-headline text-muted-foreground/30 mb-1">Schedules</p>
            <h1 className="text-2xl tracking-tight text-foreground">Scheduled Scan History</h1>
            <p className="text-caption uppercase tracking-widest text-muted-foreground/50 mt-1">
              View all historical scheduled scan executions across all schedules
            </p>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="bg-surface-1 border-white/10 rounded-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-caption uppercase tracking-widest text-muted-foreground/60">
                  Total Executions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl tracking-tight text-foreground">{history.length}</div>
              </CardContent>
            </Card>
            <Card className="bg-surface-1 border-white/10 rounded-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-caption uppercase tracking-widest text-muted-foreground/60">
                  Success Rate
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl tracking-tight text-foreground">
                  {history.length > 0
                    ? Math.round(
                        (history.filter((h) => h.status === "COMPLETED").length /
                          history.length) *
                          100
                      )
                    : 0}
                  %
                </div>
              </CardContent>
            </Card>
            <Card className="bg-surface-1 border-white/10 rounded-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-caption uppercase tracking-widest text-muted-foreground/60">
                  Images Scanned
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl tracking-tight text-foreground">
                  {history.reduce((sum, h) => sum + h.scannedImages, 0)}
                </div>
              </CardContent>
            </Card>
            <Card className="bg-surface-1 border-white/10 rounded-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-caption uppercase tracking-widest text-muted-foreground/60">
                  Critical Vulnerabilities
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl tracking-tight text-red-400">
                  {history.reduce(
                    (sum, h) => sum + h.vulnerabilityStats.critical,
                    0
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <UnifiedTable
            data={history}
            columns={getTableColumns()}
            features={{
              sorting: true,
              filtering: true,
              pagination: true,
              columnVisibility: true,
              contextMenu: true,
              search: true,
            }}
            contextMenuItems={getContextMenuItems}
            initialGlobalFilter={initialSearch}
            onRowClick={(row) => {
              // Navigate to the image scan detail page
              if (row.scanResults && row.scanResults.length > 0) {
                const firstResult = row.scanResults[0];
                if (firstResult.scanId && firstResult.imageName) {
                  router.push(`/images/${encodeURIComponent(firstResult.imageName)}/${firstResult.scanId}`);
                }
              }
            }}
            className="bg-surface-1 border border-white/10 p-6"
          />

          {/* Audit Information Modal */}
          <Dialog open={auditModalOpen} onOpenChange={setAuditModalOpen}>
            <DialogContent className="max-w-2xl border-white/10 rounded-none shadow-2xl p-0 overflow-hidden">
              <div className="p-8 border-b border-white/10 bg-surface-1">
                <DialogHeader className="space-y-3">
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 text-accent" />
                    <DialogTitle className="text-sm uppercase tracking-wide-caps text-foreground">Audit Information</DialogTitle>
                  </div>
                  <DialogDescription className="text-body-sm text-muted-foreground uppercase tracking-widest">
                    Detailed audit information for this scan execution
                  </DialogDescription>
                </DialogHeader>
              </div>
              {selectedHistory && (
                <div className="p-8 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-caption uppercase tracking-widest text-muted-foreground/50">Execution ID</Label>
                      <p className="font-mono text-body-sm mt-1">{selectedHistory.executionId}</p>
                    </div>
                    <div>
                      <Label className="text-caption uppercase tracking-widest text-muted-foreground/50">Schedule Name</Label>
                      <p className="text-body-sm mt-1">{selectedHistory.scheduledScan.name}</p>
                    </div>
                    <div>
                      <Label className="text-caption uppercase tracking-widest text-muted-foreground/50">Triggered By</Label>
                      <p className="text-body-sm mt-1">{selectedHistory.triggeredBy || "System"}</p>
                    </div>
                    <div>
                      <Label className="text-caption uppercase tracking-widest text-muted-foreground/50">Trigger Source</Label>
                      <p className="text-body-sm mt-1">{selectedHistory.triggerSource}</p>
                    </div>
                    <div>
                      <Label className="text-caption uppercase tracking-widest text-muted-foreground/50">Started At</Label>
                      <p className="text-body-sm mt-1">
                        {new Date(selectedHistory.startedAt).toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <Label className="text-caption uppercase tracking-widest text-muted-foreground/50">Completed At</Label>
                      <p className="text-body-sm mt-1">
                        {selectedHistory.completedAt
                          ? new Date(selectedHistory.completedAt).toLocaleString()
                          : "In Progress"}
                      </p>
                    </div>
                  </div>

                  <div>
                    <Label className="text-caption uppercase tracking-widest text-muted-foreground/50">Scan Statistics</Label>
                    <div className="mt-2 space-y-2 border border-white/10 p-4">
                      <div className="flex justify-between text-body-sm">
                        <span className="text-muted-foreground/60">Total Images</span>
                        <span className="text-foreground">{selectedHistory.totalImages}</span>
                      </div>
                      <div className="flex justify-between text-body-sm">
                        <span className="text-muted-foreground/60">Successfully Scanned</span>
                        <span className="text-green-400">
                          {selectedHistory.scannedImages - selectedHistory.failedImages}
                        </span>
                      </div>
                      <div className="flex justify-between text-body-sm">
                        <span className="text-muted-foreground/60">Failed</span>
                        <span className="text-red-400">
                          {selectedHistory.failedImages}
                        </span>
                      </div>
                    </div>
                  </div>

                  {selectedHistory.errorMessage && (
                    <div>
                      <Label className="text-caption uppercase tracking-widest text-muted-foreground/50">Error Message</Label>
                      <p className="mt-1 text-body-sm text-red-400">
                        {selectedHistory.errorMessage}
                      </p>
                    </div>
                  )}

                  {selectedHistory.auditInfo && (
                    <div>
                      <Label className="text-caption uppercase tracking-widest text-muted-foreground/50">
                        Additional Information
                      </Label>
                      <pre className="mt-1 text-xs bg-surface-1 border border-white/10 p-3 overflow-x-auto text-muted-foreground">
                        {JSON.stringify(selectedHistory.auditInfo, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}

function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={className}>{children}</div>;
}

export default function ScheduledScansHistoryPage() {
  return (
    <Suspense fallback={
      <FullPageLoading
        message="Loading Scan History"
        description="Fetching historical scan execution records..."
      />
    }>
      <ScheduledScansHistoryContent />
    </Suspense>
  );
}