import { ColumnDef, Row, SortingState, ColumnFiltersState, VisibilityState } from "@tanstack/react-table"
import { ReactNode } from "react"

export type CellType =
  | 'text'
  | 'badge'
  | 'status'
  | 'timestamp'
  | 'toggle-group'
  | 'cve-link'
  | 'actions'
  | 'multi-text'
  | 'registry'
  | 'duration'
  | 'interactive-badge'
  | 'scan-date'
  | 'package-info'
  | 'custom'
  | 'checkbox'

export interface CellRendererProps<T = any> {
  value: any
  row: Row<T>
  column: ColumnDefinition<T>
}

export type CellRenderer<T = any> = (props: CellRendererProps<T>) => ReactNode

export interface ColumnDefinition<T = any> {
  key: keyof T | string
  header: string | ((props: any) => ReactNode)
  type: CellType
  cellProps?: any
  sortable?: boolean
  visible?: boolean
  width?: string
  enableHiding?: boolean
  enableSorting?: boolean
  accessorFn?: (row: T) => any
}

export interface RowAction<T = any> {
  label: string
  icon?: ReactNode
  action: (row: T) => void | Promise<void>
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost'
  isVisible?: (row: T) => boolean
}

export interface ContextMenuItem<T = any> {
  label: string
  icon?: ReactNode
  action: (row: T) => void | Promise<void>
  variant?: 'default' | 'destructive'
  separator?: boolean
  subItems?: ContextMenuItem<T>[]
}

export interface TableFeatures {
  sorting?: boolean
  filtering?: boolean
  pagination?: boolean | 'server'
  selection?: boolean
  columnVisibility?: boolean
  export?: boolean
  contextMenu?: boolean
  search?: boolean
}

export interface ServerPaginationConfig {
  currentPage: number
  totalPages: number
  pageSize: number
  totalItems: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (size: number) => void
}

export interface UnifiedTableProps<T = any> {
  // Data
  data: T[]
  columns: ColumnDefinition<T>[]

  // Features
  features?: TableFeatures

  // Customization
  cellRenderers?: Record<string, CellRenderer<T>>
  rowActions?: RowAction<T>[]
  contextMenuItems?: (row: T) => ContextMenuItem<T>[]

  // Server-side support
  serverPagination?: ServerPaginationConfig

  // Events
  onRowClick?: (row: T) => void
  onSelectionChange?: (selectedRows: T[]) => void
  onDataChange?: (data: T[]) => void

  // UI Options
  className?: string
  tableClassName?: string
  isLoading?: boolean
  emptyMessage?: string
  showHeader?: boolean
  stickyHeader?: boolean

  // Row identification
  getRowId?: (row: T) => string

  // Initial state
  initialSorting?: SortingState
  initialFilters?: ColumnFiltersState
  initialColumnVisibility?: VisibilityState
}

export interface TableState<T = any> {
  sorting: SortingState
  columnFilters: ColumnFiltersState
  columnVisibility: VisibilityState
  rowSelection: Record<string, boolean>
  globalFilter: string
  pagination: {
    pageIndex: number
    pageSize: number
  }
}