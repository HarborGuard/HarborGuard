"use client";

import { UnifiedTable } from "@/components/table/unified-table";
import { ColumnDefinition } from "@/components/table/types";
import { useState, useEffect } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Eye, RefreshCw } from "lucide-react";
import { AuditLogFilters } from "@/components/shared/audit-log-filters";
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
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface AuditLogFiltersState {
  eventType?: string;
  category?: string;
  userIp?: string;
  resource?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
}

interface AuditLog {
  id: string;
  eventType: string;
  category: string;
  userIp: string;
  userAgent?: string;
  userId?: string;
  resource?: string;
  action: string;
  details?: Record<string, any>;
  metadata?: Record<string, any>;
  timestamp: string;
}

interface AuditLogResponse {
  auditLogs: AuditLog[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Separate component for the audit logs table
function AuditLogsTable({ filters }: { filters: AuditLogFiltersState }) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  useEffect(() => {
    fetchAuditLogs();
  }, [page, filters]);

  const fetchAuditLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
        ...Object.entries(filters).reduce((acc, [key, value]) => {
          if (value) acc[key] = value;
          return acc;
        }, {} as any),
      });

      const response = await fetch(`/api/audit-logs?${params}`);
      if (!response.ok) throw new Error('Failed to fetch audit logs');

      const data: AuditLogResponse = await response.json();
      setLogs(data.auditLogs);
      setTotalPages(data.pagination.totalPages);
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      toast.error('Failed to fetch audit logs');
    } finally {
      setLoading(false);
    }
  };

  const getColumns = (): ColumnDefinition<AuditLog>[] => [
    {
      key: 'timestamp',
      header: 'Timestamp',
      type: 'timestamp',
      sortable: true,
      cellProps: { showRelative: true },
    },
    {
      key: 'eventType',
      header: 'Event Type',
      type: 'text',
      accessorFn: (row: AuditLog) => getEventTypeLabel(row.eventType),
    },
    {
      key: 'category',
      header: 'Category',
      type: 'badge',
      cellProps: {
        variant: (value: string) => getCategoryVariant(value),
      },
    },
    {
      key: 'userIp',
      header: 'User IP',
      type: 'text',
    },
    {
      key: 'resource',
      header: 'Resource',
      type: 'text',
    },
    {
      key: 'action',
      header: 'Action',
      type: 'text',
    },
  ];

  return (
    <>
      <UnifiedTable
        data={logs}
        columns={getColumns()}
        features={{
          sorting: true,
          filtering: false,
          pagination: 'server',
          search: false,
        }}
        serverPagination={{
          currentPage: page,
          totalPages,
          pageSize: 20,
          totalItems: totalPages * 20,
          onPageChange: setPage,
        }}
        isLoading={loading}
        rowActions={[
          {
            label: 'View Details',
            icon: <Eye className="h-4 w-4" />,
            action: (row) => setSelectedLog(row),
            variant: 'outline',
          },
        ]}
      />

      {/* Audit Log Details Modal */}
      <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] border-white/10 rounded-none shadow-2xl p-0 overflow-hidden">
          <div className="p-8 border-b border-white/10 bg-surface-1">
            <DialogHeader className="space-y-3">
              <DialogTitle className="text-sm uppercase tracking-wide-caps text-foreground">Audit Log Details</DialogTitle>
              <DialogDescription className="text-body-sm text-muted-foreground uppercase tracking-widest">
                {selectedLog && format(new Date(selectedLog.timestamp), "PPpp")}
              </DialogDescription>
            </DialogHeader>
          </div>

          <ScrollArea className="mt-0 h-[50vh] w-full p-8">
            {selectedLog && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-caption uppercase tracking-widest text-muted-foreground/50">Event Type</p>
                    <p className="text-body-sm text-foreground mt-1">{getEventTypeLabel(selectedLog.eventType)}</p>
                  </div>
                  <div>
                    <p className="text-caption uppercase tracking-widest text-muted-foreground/50">Category</p>
                    <Badge variant={getCategoryVariant(selectedLog.category)}>
                      {selectedLog.category}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-caption uppercase tracking-widest text-muted-foreground/50">User IP</p>
                    <p className="text-body-sm font-mono text-foreground mt-1">{selectedLog.userIp}</p>
                  </div>
                  <div>
                    <p className="text-caption uppercase tracking-widest text-muted-foreground/50">Action</p>
                    <p className="text-body-sm text-foreground mt-1">{selectedLog.action}</p>
                  </div>
                  {selectedLog.resource && (
                    <div>
                      <p className="text-caption uppercase tracking-widest text-muted-foreground/50">Resource</p>
                      <p className="text-body-sm text-foreground mt-1">{selectedLog.resource}</p>
                    </div>
                  )}
                  {selectedLog.userId && (
                    <div>
                      <p className="text-caption uppercase tracking-widest text-muted-foreground/50">User ID</p>
                      <p className="text-body-sm font-mono text-foreground mt-1">{selectedLog.userId}</p>
                    </div>
                  )}
                </div>

                {selectedLog.userAgent && (
                  <div>
                    <p className="text-caption uppercase tracking-widest text-muted-foreground/50">User Agent</p>
                    <p className="text-body-sm font-mono text-muted-foreground break-all mt-1">{selectedLog.userAgent}</p>
                  </div>
                )}

                {selectedLog.details && Object.keys(selectedLog.details).length > 0 && (
                  <div>
                    <p className="text-caption uppercase tracking-widest text-muted-foreground/50 mb-2">Details</p>
                    <pre className="text-xs bg-surface-1 border border-white/10 p-3 overflow-x-auto text-muted-foreground">
                      {JSON.stringify(selectedLog.details, null, 2)}
                    </pre>
                  </div>
                )}

                {selectedLog.metadata && Object.keys(selectedLog.metadata).length > 0 && (
                  <div>
                    <p className="text-caption uppercase tracking-widest text-muted-foreground/50 mb-2">Metadata</p>
                    <pre className="text-xs bg-surface-1 border border-white/10 p-3 overflow-x-auto text-muted-foreground">
                      {JSON.stringify(selectedLog.metadata, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}

const getCategoryVariant = (category: string) => {
  switch (category) {
    case 'action':
      return 'default';
    case 'informative':
      return 'secondary';
    case 'security':
    case 'error':
      return 'destructive';
    default:
      return 'outline';
  }
};

const getEventTypeLabel = (eventType: string) => {
  const labels: Record<string, string> = {
    page_view: 'Page View',
    scan_start: 'Scan Start',
    scan_complete: 'Scan Complete',
    scan_failed: 'Scan Failed',
    cve_classification: 'CVE Classification',
    image_delete: 'Image Delete',
    image_rescan: 'Image Rescan',
    bulk_scan_start: 'Bulk Scan Start',
    user_login: 'User Login',
    user_logout: 'User Logout',
    system_error: 'System Error',
  };
  return labels[eventType] || eventType;
};

export default function AuditLogsPage() {
  const [filters, setFilters] = useState<AuditLogFiltersState>({});

  const breadcrumbs = [
    { label: "Dashboard", href: "/" },
    { label: "Audit Logs" },
  ];

  return (
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-4 overflow-auto p-4 lg:p-6">
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-caption uppercase tracking-headline text-muted-foreground/30 mb-1">Security</p>
            <h1 className="text-2xl tracking-tight text-foreground">Audit Logs</h1>
            <p className="text-body-sm uppercase tracking-widest text-muted-foreground mt-1">
              Track all user actions and system events for security and compliance monitoring
            </p>
          </div>

          <Card className="bg-surface-1 border-white/10 rounded-none">
            <CardHeader>
              <CardTitle className="text-sm uppercase tracking-wide-caps text-foreground flex items-center gap-3"><Eye className="h-4 w-4 text-accent" />Filter Audit Logs</CardTitle>
              <CardDescription className="text-caption uppercase tracking-widest text-muted-foreground/50">
                Filter audit logs by event type, category, user, or time range
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AuditLogFilters filters={filters} onFiltersChange={setFilters} />
            </CardContent>
          </Card>

          <Card className="bg-surface-1 border-white/10 rounded-none">
            <CardHeader>
              <CardTitle className="text-sm uppercase tracking-wide-caps text-foreground flex items-center gap-3"><RefreshCw className="h-4 w-4 text-accent" />Audit Events</CardTitle>
              <CardDescription className="text-caption uppercase tracking-widest text-muted-foreground/50">
                Complete log of all system activities and user actions
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <AuditLogsTable filters={filters} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
