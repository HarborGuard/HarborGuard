"use client"

import * as React from "react"
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import {
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
  IconChevronsRight,
  IconLayoutColumns,
  IconSearch,
} from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"

import { UnifiedTableProps, CellRenderer, ContextMenuItem as ContextMenuItemType } from "./types"
import { createColumnDef } from "./utils"
import { getCellRenderers } from "./cell-renderers"

export function UnifiedTable<T extends Record<string, any>>({
  data,
  columns,
  features = {},
  cellRenderers: customCellRenderers = {},
  rowActions,
  contextMenuItems,
  serverPagination,
  onRowClick,
  onSelectionChange,
  onDataChange,
  className = "",
  tableClassName = "",
  isLoading = false,
  emptyMessage = "No results.",
  showHeader = true,
  stickyHeader = false,
  getRowId,
  initialSorting = [],
  initialFilters = [],
  initialColumnVisibility = {},
}: UnifiedTableProps<T>) {
  // State
  const [sorting, setSorting] = React.useState<SortingState>(initialSorting)
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(initialFilters)
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>(initialColumnVisibility)
  const [rowSelection, setRowSelection] = React.useState({})
  const [globalFilter, setGlobalFilter] = React.useState("")
  const [pagination, setPagination] = React.useState({
    pageIndex: 0,
    pageSize: serverPagination?.pageSize || 10,
  })

  // Merge default and custom cell renderers
  const allCellRenderers = React.useMemo(() => {
    return {
      ...getCellRenderers<T>(),
      ...customCellRenderers,
    }
  }, [customCellRenderers])

  // Convert column definitions to TanStack columns
  const tableColumns = React.useMemo(() => {
    const cols: ColumnDef<T>[] = []

    // Add selection column if enabled
    if (features.selection) {
      cols.push({
        id: "select",
        header: ({ table }) => (
          <input
            type="checkbox"
            checked={table.getIsAllPageRowsSelected()}
            onChange={(e) => table.toggleAllPageRowsSelected(!!e.target.checked)}
            onClick={(e) => e.stopPropagation()}
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            checked={row.getIsSelected()}
            onChange={(e) => row.toggleSelected(!!e.target.checked)}
            onClick={(e) => e.stopPropagation()}
            aria-label="Select row"
          />
        ),
        enableSorting: false,
        enableHiding: false,
      })
    }

    // Add data columns
    columns.forEach((column) => {
      if (column.visible !== false) {
        cols.push(createColumnDef(column, allCellRenderers))
      }
    })

    // Add actions column if row actions are defined
    if (rowActions && rowActions.length > 0) {
      cols.push({
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          const visibleActions = rowActions.filter(
            action => !action.isVisible || action.isVisible(row.original)
          )
          return (
            <div className="flex gap-1">
              {visibleActions.map((action, index) => (
                <Button
                  key={index}
                  variant={action.variant || "ghost"}
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    action.action(row.original)
                  }}
                >
                  {action.icon}
                  {action.label}
                </Button>
              ))}
            </div>
          )
        },
        enableSorting: false,
        enableHiding: false,
      })
    }

    return cols
  }, [columns, features.selection, rowActions, allCellRenderers])

  // Create table instance
  const table = useReactTable({
    data,
    columns: tableColumns,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
      globalFilter,
      pagination: serverPagination ? undefined : pagination,
    },
    getRowId: getRowId ? (row) => getRowId(row) : undefined,
    enableRowSelection: features.selection || false,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: serverPagination ? undefined : setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: features.filtering ? getFilteredRowModel() : undefined,
    getPaginationRowModel: features.pagination && !serverPagination ? getPaginationRowModel() : undefined,
    getSortedRowModel: features.sorting ? getSortedRowModel() : undefined,
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    manualPagination: !!serverPagination,
    pageCount: serverPagination ? serverPagination.totalPages : undefined,
  })

  // Handle selection changes
  React.useEffect(() => {
    if (onSelectionChange) {
      const selectedRows = table.getSelectedRowModel().rows.map(row => row.original)
      onSelectionChange(selectedRows)
    }
  }, [rowSelection, onSelectionChange, table])

  // Render context menu
  const renderContextMenu = (row: any) => {
    if (!contextMenuItems) return null

    const items = contextMenuItems(row.original)
    if (!items || items.length === 0) return null

    return (
      <ContextMenuContent>
        {items.map((item, index) => {
          // Check if this is just a separator (no label or action)
          if (item.separator && !item.label && !item.action) {
            return <ContextMenuSeparator key={index} />
          }

          const elements = []

          // Add separator before the item if separator is true
          if (item.separator && item.label) {
            elements.push(<ContextMenuSeparator key={`${index}-sep`} />)
          }

          if (item.subItems) {
            elements.push(
              <ContextMenuSub key={index}>
                <ContextMenuSubTrigger className="flex items-center">
                  {item.icon}
                  {item.label}
                </ContextMenuSubTrigger>
                <ContextMenuSubContent>
                  {item.subItems.map((subItem, subIndex) => {
                    if (subItem.separator && !subItem.label) {
                      return <ContextMenuSeparator key={subIndex} />
                    }

                    return (
                      <React.Fragment key={subIndex}>
                        {subItem.separator && <ContextMenuSeparator />}
                        <ContextMenuItem
                          onClick={() => subItem.action(row.original)}
                          className={subItem.variant === 'destructive' ? 'text-red-600' : ''}
                        >
                          {subItem.icon}
                          {subItem.label}
                        </ContextMenuItem>
                      </React.Fragment>
                    )
                  })}
                </ContextMenuSubContent>
              </ContextMenuSub>
            )
          } else if (item.label && item.action) {
            elements.push(
              <ContextMenuItem
                key={index}
                onClick={() => item.action(row.original)}
                className={item.variant === 'destructive' ? 'text-red-600' : ''}
              >
                {item.icon}
                {item.label}
              </ContextMenuItem>
            )
          }

          return elements.length > 0 ? <React.Fragment key={index}>{elements}</React.Fragment> : null
        })}
      </ContextMenuContent>
    )
  }

  // Handle row click
  const handleRowClick = (row: any) => {
    if (onRowClick) {
      onRowClick(row.original)
    }
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        {/* Search */}
        {features.search && (
          <div className="flex items-center space-x-2">
            <IconSearch className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="w-64"
            />
          </div>
        )}

        {/* Column visibility */}
        {features.columnVisibility && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <IconLayoutColumns className="mr-2 h-4 w-4" />
                Columns
                <IconChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {table
                .getAllColumns()
                .filter(column => column.getCanHide())
                .map(column => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    className="capitalize"
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) => column.toggleVisibility(!!value)}
                  >
                    {column.id}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Table */}
      <div className="rounded-md border overflow-hidden">
        <Table className={tableClassName}>
          {showHeader && (
            <TableHeader className={stickyHeader ? "sticky top-0 z-10 bg-background" : ""}>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id} colSpan={header.colSpan}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
          )}
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={tableColumns.length} className="h-24 text-center">
                  Loading...
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => {
                const rowContent = (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                    onClick={() => handleRowClick(row)}
                    className={onRowClick ? "cursor-pointer hover:bg-muted/50" : ""}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                )

                if (features.contextMenu && contextMenuItems) {
                  return (
                    <ContextMenu key={row.id}>
                      <ContextMenuTrigger asChild>{rowContent}</ContextMenuTrigger>
                      {renderContextMenu(row)}
                    </ContextMenu>
                  )
                }

                return rowContent
              })
            ) : (
              <TableRow>
                <TableCell colSpan={tableColumns.length} className="h-24 text-center">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {features.pagination && (
        <div className="flex items-center justify-between px-2">
          <div className="text-sm text-muted-foreground">
            {features.selection && (
              <>
                {table.getFilteredSelectedRowModel().rows.length} of{" "}
                {table.getFilteredRowModel().rows.length} row(s) selected.
              </>
            )}
          </div>
          <div className="flex items-center space-x-6">
            {!serverPagination && (
              <div className="flex items-center space-x-2">
                <Label htmlFor="rows-per-page" className="text-sm">
                  Rows per page
                </Label>
                <Select
                  value={`${pagination.pageSize}`}
                  onValueChange={(value) => setPagination(prev => ({ ...prev, pageSize: Number(value) }))}
                >
                  <SelectTrigger className="w-20" id="rows-per-page">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[10, 20, 30, 40, 50, 100].map((pageSize) => (
                      <SelectItem key={pageSize} value={`${pageSize}`}>
                        {pageSize}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex items-center space-x-2">
              <div className="text-sm">
                Page {serverPagination ? serverPagination.currentPage : (pagination.pageIndex + 1)} of{" "}
                {serverPagination ? serverPagination.totalPages : table.getPageCount()}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => {
                    if (serverPagination) {
                      serverPagination.onPageChange(1)
                    } else {
                      setPagination(prev => ({ ...prev, pageIndex: 0 }))
                    }
                  }}
                  disabled={serverPagination ? serverPagination.currentPage === 1 : !table.getCanPreviousPage()}
                >
                  <IconChevronsLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => {
                    if (serverPagination) {
                      serverPagination.onPageChange(serverPagination.currentPage - 1)
                    } else {
                      setPagination(prev => ({ ...prev, pageIndex: prev.pageIndex - 1 }))
                    }
                  }}
                  disabled={serverPagination ? serverPagination.currentPage === 1 : !table.getCanPreviousPage()}
                >
                  <IconChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => {
                    if (serverPagination) {
                      serverPagination.onPageChange(serverPagination.currentPage + 1)
                    } else {
                      setPagination(prev => ({ ...prev, pageIndex: prev.pageIndex + 1 }))
                    }
                  }}
                  disabled={serverPagination ? serverPagination.currentPage === serverPagination.totalPages : !table.getCanNextPage()}
                >
                  <IconChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => {
                    if (serverPagination) {
                      serverPagination.onPageChange(serverPagination.totalPages)
                    } else {
                      setPagination(prev => ({ ...prev, pageIndex: table.getPageCount() - 1 }))
                    }
                  }}
                  disabled={serverPagination ? serverPagination.currentPage === serverPagination.totalPages : !table.getCanNextPage()}
                >
                  <IconChevronsRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}