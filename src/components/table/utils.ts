import { ColumnDef } from "@tanstack/react-table"
import { ColumnDefinition, CellRenderer } from "./types"
import { flexRender } from "@tanstack/react-table"

export function createColumnDef<T>(
  column: ColumnDefinition<T>,
  cellRenderers: Record<string, CellRenderer<T>>
): ColumnDef<T> {
  const columnDef: any = {
    id: column.key as string,
    header: column.header,
    enableSorting: column.sortable ?? column.enableSorting ?? false,
    enableHiding: column.enableHiding !== false,
  }

  if (column.accessorFn) {
    columnDef.accessorFn = column.accessorFn
  } else {
    columnDef.accessorKey = column.key as string
  }

  // Set up cell renderer based on type
  const renderer = cellRenderers[column.type] || cellRenderers['text']
  if (renderer) {
    columnDef.cell = ({ row, getValue }: any) => {
      return renderer({ value: getValue(), row, column })
    }
  }

  return columnDef
}

export function formatDate(date: string | Date): string {
  if (!date) return "N/A"

  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date
    if (isNaN(dateObj.getTime())) {
      return "Invalid Date"
    }
    return dateObj.toLocaleDateString() + " " + dateObj.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch (error) {
    return "Invalid Date"
  }
}

export function formatRelativeTime(date: string | Date): string {
  if (!date) return "N/A"

  try {
    const dateObj = typeof date === 'string' ? new Date(date) : date
    const now = new Date()
    const diffMs = now.getTime() - dateObj.getTime()
    const diffSecs = Math.floor(diffMs / 1000)
    const diffMins = Math.floor(diffSecs / 60)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffDays > 0) return `${diffDays}d ago`
    if (diffHours > 0) return `${diffHours}h ago`
    if (diffMins > 0) return `${diffMins}m ago`
    return "Just now"
  } catch (error) {
    return "N/A"
  }
}

export function getSeverityVariant(severity: string): string {
  const normalizedSeverity = severity.toLowerCase()
  switch (normalizedSeverity) {
    case 'critical':
    case 'crit':
    case 'high':
      return 'destructive'
    case 'medium':
    case 'med':
      return 'secondary'
    case 'low':
    case 'info':
      return 'outline'
    default:
      return 'default'
  }
}

export function getRiskScoreVariant(score: number): string {
  if (score > 70) return 'destructive'
  if (score > 40) return 'secondary'
  return 'default'
}