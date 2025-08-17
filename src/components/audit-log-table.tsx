"use client"

import { useState, useEffect } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight,
  Eye,
  RefreshCw
} from "lucide-react"
import { format } from "date-fns"
import { toast } from "sonner"

export interface AuditLogFilters {
  eventType?: string
  category?: string
  userIp?: string
  resource?: string
  search?: string
  startDate?: string
  endDate?: string
}

interface AuditLog {
  id: string
  eventType: string
  category: string
  userIp: string
  userAgent?: string
  userId?: string
  resource?: string
  action: string
  details?: Record<string, any>
  metadata?: Record<string, any>
  timestamp: string
}

interface AuditLogResponse {
  auditLogs: AuditLog[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

interface AuditLogTableProps {
  filters: AuditLogFilters
}

const getCategoryVariant = (category: string) => {
  switch (category) {
    case 'action':
      return 'default'
    case 'informative':
      return 'secondary'
    case 'security':
      return 'destructive'
    case 'error':
      return 'destructive'
    default:
      return 'outline'
  }
}

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
  }
  return labels[eventType] || eventType
}

export function AuditLogTable({ filters }: AuditLogTableProps) {
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
  })
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)

  const fetchLogs = async () => {
    try {
      setLoading(true)
      
      // Build query parameters
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
      })
      
      Object.entries(filters).forEach(([key, value]) => {
        if (value) {
          params.append(key, value)
        }
      })

      const response = await fetch(`/api/audit-logs?${params}`)
      
      if (!response.ok) {
        throw new Error('Failed to fetch audit logs')
      }

      const data: AuditLogResponse = await response.json()
      setLogs(data.auditLogs)
      setPagination(data.pagination)
    } catch (error) {
      console.error('Error fetching audit logs:', error)
      toast.error('Failed to fetch audit logs')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLogs()
  }, [filters, pagination.page])

  const handlePageChange = (newPage: number) => {
    setPagination(prev => ({ ...prev, page: newPage }))
  }

  const showDetails = (log: AuditLog) => {
    setSelectedLog(log)
    setDetailsOpen(true)
  }

  const refresh = () => {
    fetchLogs()
  }

  if (loading && logs.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2" />
          <p className="text-muted-foreground">Loading audit logs...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-6 py-4 border-b">
        <div className="text-sm text-muted-foreground">
          Showing {logs.length} of {pagination.total} entries
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={refresh}
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Timestamp</TableHead>
              <TableHead>Event Type</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>User IP</TableHead>
              <TableHead>Resource</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="font-mono text-sm">
                  {format(new Date(log.timestamp), 'MMM dd, yyyy HH:mm:ss')}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {getEventTypeLabel(log.eventType)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={getCategoryVariant(log.category)}>
                    {log.category}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-sm">
                  {log.userIp}
                </TableCell>
                <TableCell>
                  {log.resource ? (
                    <span className="font-mono text-sm">{log.resource}</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="max-w-md truncate">
                  {log.action}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => showDetails(log)}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {logs.length === 0 && !loading && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No audit logs found matching your criteria.</p>
        </div>
      )}

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between px-6 py-4 border-t">
          <div className="text-sm text-muted-foreground">
            Page {pagination.page} of {pagination.totalPages}
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(1)}
              disabled={pagination.page === 1}
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(pagination.page - 1)}
              disabled={pagination.page === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(pagination.page + 1)}
              disabled={pagination.page === pagination.totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(pagination.totalPages)}
              disabled={pagination.page === pagination.totalPages}
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Audit Log Details</DialogTitle>
            <DialogDescription>
              Complete information about this audit event
            </DialogDescription>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Event Type</label>
                  <p className="text-sm text-muted-foreground">
                    {getEventTypeLabel(selectedLog.eventType)}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium">Category</label>
                  <p className="text-sm text-muted-foreground">
                    <Badge variant={getCategoryVariant(selectedLog.category)}>
                      {selectedLog.category}
                    </Badge>
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium">Timestamp</label>
                  <p className="text-sm text-muted-foreground font-mono">
                    {format(new Date(selectedLog.timestamp), 'PPpp')}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium">User IP</label>
                  <p className="text-sm text-muted-foreground font-mono">
                    {selectedLog.userIp}
                  </p>
                </div>
                {selectedLog.resource && (
                  <div>
                    <label className="text-sm font-medium">Resource</label>
                    <p className="text-sm text-muted-foreground font-mono">
                      {selectedLog.resource}
                    </p>
                  </div>
                )}
                {selectedLog.userId && (
                  <div>
                    <label className="text-sm font-medium">User ID</label>
                    <p className="text-sm text-muted-foreground">
                      {selectedLog.userId}
                    </p>
                  </div>
                )}
              </div>

              <div>
                <label className="text-sm font-medium">Action</label>
                <p className="text-sm text-muted-foreground">
                  {selectedLog.action}
                </p>
              </div>

              {selectedLog.userAgent && (
                <div>
                  <label className="text-sm font-medium">User Agent</label>
                  <p className="text-sm text-muted-foreground font-mono break-all">
                    {selectedLog.userAgent}
                  </p>
                </div>
              )}

              {selectedLog.details && Object.keys(selectedLog.details).length > 0 && (
                <div>
                  <label className="text-sm font-medium">Event Details</label>
                  <pre className="text-xs bg-muted p-3 rounded-md overflow-auto">
                    {JSON.stringify(selectedLog.details, null, 2)}
                  </pre>
                </div>
              )}

              {selectedLog.metadata && Object.keys(selectedLog.metadata).length > 0 && (
                <div>
                  <label className="text-sm font-medium">Request Metadata</label>
                  <pre className="text-xs bg-muted p-3 rounded-md overflow-auto">
                    {JSON.stringify(selectedLog.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}