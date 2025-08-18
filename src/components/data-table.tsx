"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core"
import { restrictToVerticalAxis } from "@dnd-kit/modifiers"
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
  IconChevronsRight,
  IconDotsVertical,
  IconGripVertical,
  IconLayoutColumns,
  IconTrendingUp,
  IconRefresh,
  IconTrash,
} from "@tabler/icons-react"
import {
  ColumnDef,
  ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  Row,
  SortingState,
  useReactTable,
  VisibilityState,
} from "@tanstack/react-table"
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts"
import { toast } from "sonner"
import { z } from "zod"

import { useIsMobile } from "@/hooks/use-mobile"
import { Badge } from "@/components/ui/badge"
import { ImageStatusCell } from "@/components/image-status-cell"
import { Button } from "@/components/ui/button"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { DeleteImageDialog } from "@/components/delete-image-dialog"
import { useScanning } from "@/providers/ScanningProvider"
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tabs,
  TabsContent,
} from "@/components/ui/tabs"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group"
import { aggregateUniqueVulnerabilitiesFromLegacyScans } from "@/lib/scan-aggregations"


const severityCountsSchema = z.object({
  crit: z.number().int().nonnegative(),
  high: z.number().int().nonnegative(),
  med: z.number().int().nonnegative(),
  low: z.number().int().nonnegative(),
}).strict();

const complianceSchema = z.object({
  dockle: z.enum(["A", "B", "C", "D", "E", "F"]).optional(),
}).strict();

export const schema = z.object({
  // Identity / basics
  id: z.number().int().positive(),
  imageId: z.string(),                             // Image ID for navigation
  imageName: z.string(),                           // Image name for new navigation
  image: z.string(),                                // e.g., ghcr.io/acme/api:1.4.2
  source: z.string().optional(),                   // Image source: 'local' or 'registry'
  digestShort: z.string().regex(/^sha256:[a-f0-9]{6,}$/).optional(),
  platform: z.string().optional(),                     // e.g., linux/amd64
  sizeMb: z.number().int().nonnegative().optional(),

  // Risk & vuln summary
  riskScore: z.number().int().min(0).max(100),          // 0–100
  severities: severityCountsSchema,                      // {crit, high, med, low}
  fixable: z.object({
    count: z.number().int().nonnegative(),
    percent: z.number().min(0).max(100),
  }),
  highestCvss: z.number().min(0).max(10).optional(),
  misconfigs: z.number().int().nonnegative().default(0),
  secrets: z.number().int().nonnegative().default(0),

  // Compliance / policy
  compliance: complianceSchema.optional(),
  policy: z.enum(["Pass", "Warn", "Blocked"]).optional(),

  // Usage / deltas
  delta: z.object({
    newCrit: z.number().int().nonnegative().optional(),
    resolvedTotal: z.number().int().nonnegative().optional(),
  }).optional(),
  inUse: z.object({
    clusters: z.number().int().nonnegative(),
    pods: z.number().int().nonnegative(),
  }).optional(),

  // Metadata
  baseImage: z.string().optional(),
  baseUpdate: z.string().optional(),                     // e.g., "12.7 available"
  signed: z.boolean().optional(),
  attested: z.boolean().optional(),
  sbomFormat: z.enum(["spdx", "cyclonedx"]).optional(),
  dbAge: z.string().optional(),                     // e.g., "2h"
  registry: z.string().optional(),
  project: z.string().optional(),

  // Timestamps / status
  lastScan: z.string().datetime(),                     // ISO 8601
  status: z.enum(["Complete", "Queued", "Error", "Prior"]),

  // Legacy (kept optional for compatibility)
  header: z.string().optional(),
  type: z.string().optional(),
  target: z.string().optional(),
  limit: z.string().optional(),
  
  // Metadata for grouped images
  _tagCount: z.number().optional(),
  _allTags: z.string().optional(),
}).strict();

export type ScanRow = z.infer<typeof schema>;


// Create a separate component for the drag handle
function DragHandle({ id }: { id: number }) {
  const { attributes, listeners } = useSortable({
    id,
  })

  return (
    <Button
      {...attributes}
      {...listeners}
      variant="ghost"
      size="icon"
      className="text-muted-foreground cursor-pointer size-7 hover:bg-transparent"
    >
      <IconGripVertical className="text-muted-foreground size-3" />
      <span className="sr-only">Drag to reorder</span>
    </Button>
  )
}

const columns: ColumnDef<z.infer<typeof schema>>[] = [
  {
    id: "drag",
    header: () => null,
    cell: ({ row }) => <DragHandle id={row.original.id} />,
  },
  {
    id: "select",
    header: ({ table }) => (
      <div className="flex items-center justify-center">
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      </div>
    ),
    cell: ({ row }) => (
      <div className="flex items-center justify-center">
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      </div>
    ),
    enableSorting: false,
    enableHiding: false,
  },
  // Identity / basics
  {
    accessorKey: "image",
    header: "Image",
    cell: ({ row }) => {
      const imageName = row.original.image;
      const tagCount = (row.original as any)._tagCount || 1;
      const allTags = (row.original as any)._allTags || '';
      
      return (
        <div className="flex flex-col">
          <span className="font-medium">{imageName}</span>
          {tagCount > 1 && (
            <span className="text-xs text-muted-foreground" title={`Tags: ${allTags}`}>
              {tagCount} tags: {allTags.length > 30 ? allTags.substring(0, 30) + '...' : allTags}
            </span>
          )}
        </div>
      );
    },
    enableHiding: false,
  },
  {
    accessorKey: "digestShort",
    header: "Digest",
    cell: ({ row }) => row.original.digestShort || "N/A",
  },
  {
    accessorKey: "platform",
    header: "Platform",
    cell: ({ row }) => (
      <div className="w-32">
        <Badge variant="outline" className="text-muted-foreground px-1.5">
          {row.original.platform}
        </Badge>
      </div>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <ImageStatusCell 
        imageName={row.original.imageName || row.original.image.split(':')[0]}
        imageId={row.original.imageId}
        status={row.original.status}
      />
    ),
  },
  
  {
    accessorKey: "sizeMb",
    header: "Size (MB)",
    cell: ({ row }) => row.original.sizeMb || "N/A",
  },

  // Risk & vuln summary
  {
    accessorKey: "riskScore",
    header: "Risk Score",
    cell: ({ row }) => (
      <Badge variant={row.original.riskScore > 70 ? "destructive" : row.original.riskScore > 40 ? "secondary" : "default"}>
        {row.original.riskScore}
      </Badge>
    ),
  },
  {
    accessorKey: "severities",
    header: "Findings",
    cell: ({ row }) => {
      const { crit, high, med, low } = row.original.severities;
      return (
        <ToggleGroup type="multiple" variant="outline">
          {crit > 0 && (
            <ToggleGroupItem
              value="critical"
              className="bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800 hover:bg-red-500/20 px-2 py-1 text-xs"
            >
              C: {crit}
            </ToggleGroupItem>
          )}
          {high > 0 && (
            <ToggleGroupItem
              value="high"
              className="bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800 hover:bg-orange-500/20 px-2 py-1 text-xs"
            >
              H: {high}
            </ToggleGroupItem>
          )}
          {med > 0 && (
            <ToggleGroupItem
              value="medium"
              className="bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800 hover:bg-yellow-500/20 px-2 py-1 text-xs"
            >
              M: {med}
            </ToggleGroupItem>
          )}
          {low > 0 && (
            <ToggleGroupItem
              value="low"
              className="bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800 hover:bg-blue-500/20 px-2 py-1 text-xs"
            >
              L: {low}
            </ToggleGroupItem>
          )}
        </ToggleGroup>
      );
    },
  },
  {
    accessorKey: "fixable.count",
    header: "Fixable Count",
    cell: ({ row }) => row.original.fixable.count,
  },
  {
    accessorKey: "fixable.percent",
    header: "Fixable %",
    cell: ({ row }) => `${row.original.fixable.percent}%`,
  },
  {
    accessorKey: "highestCvss",
    header: "Highest CVSS",
    cell: ({ row }) => row.original.highestCvss || "N/A",
  },
  {
    accessorKey: "misconfigs",
    header: "Misconfigs",
    cell: ({ row }) => row.original.misconfigs,
  },
  {
    accessorKey: "secrets",
    header: "Secrets",
    cell: ({ row }) => row.original.secrets,
  },
  // Compliance / policy
  {
    accessorKey: "compliance.dockle",
    header: "Dockle",
    cell: ({ row }) => row.original.compliance?.dockle || "N/A",
  },
  {
    accessorKey: "policy",
    header: "Policy",
    cell: ({ row }) => (
      <Badge variant={row.original.policy === "Blocked" ? "destructive" : row.original.policy === "Warn" ? "secondary" : "default"}>
        {row.original.policy || "N/A"}
      </Badge>
    ),
  },

  // Usage / deltas
  {
    accessorKey: "delta.newCrit",
    header: "New Critical",
    cell: ({ row }) => row.original.delta?.newCrit || "N/A",
  },
  {
    accessorKey: "delta.resolvedTotal",
    header: "Resolved Total",
    cell: ({ row }) => row.original.delta?.resolvedTotal || "N/A",
  },
  {
    accessorKey: "inUse.clusters",
    header: "Clusters",
    cell: ({ row }) => row.original.inUse?.clusters || "N/A",
  },
  {
    accessorKey: "inUse.pods",
    header: "Pods",
    cell: ({ row }) => row.original.inUse?.pods || "N/A",
  },

  // Metadata
  {
    accessorKey: "baseImage",
    header: "Base Image",
    cell: ({ row }) => row.original.baseImage || "N/A",
  },
  {
    accessorKey: "baseUpdate",
    header: "Base Update",
    cell: ({ row }) => row.original.baseUpdate || "N/A",
  },
  {
    accessorKey: "signed",
    header: "Signed",
    cell: ({ row }) => row.original.signed ? "Yes" : "No",
  },
  {
    accessorKey: "attested",
    header: "Attested",
    cell: ({ row }) => row.original.attested ? "Yes" : "No",
  },
  {
    accessorKey: "sbomFormat",
    header: "SBOM Format",
    cell: ({ row }) => row.original.sbomFormat || "N/A",
  },
  {
    accessorKey: "dbAge",
    header: "DB Age",
    cell: ({ row }) => row.original.dbAge || "N/A",
  },
  {
    accessorKey: "registry",
    header: "Registry",
    cell: ({ row }) => row.original.registry || "N/A",
  },
  {
    accessorKey: "project",
    header: "Project",
    cell: ({ row }) => row.original.project || "N/A",
  },

  // Timestamps / status
  {
    accessorKey: "lastScan",
    header: "Last Scan",
    cell: ({ row }) => new Date(row.original.lastScan).toLocaleDateString(),
  },

  // Legacy fields
  {
    accessorKey: "header",
    header: "Header",
    cell: ({ row }) => row.original.header || "N/A",
  },
  {
    accessorKey: "type",
    header: "Type",
    cell: ({ row }) => row.original.type || "N/A",
  },
  {
    accessorKey: "target",
    header: "Target",
    cell: ({ row }) => row.original.target || "N/A",
  },
  {
    accessorKey: "limit",
    header: "Limit",
    cell: ({ row }) => row.original.limit || "N/A",
  },
  {
    id: "actions",
    cell: () => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="data-[state=open]:bg-muted text-muted-foreground flex size-8"
            size="icon"
          >
            <IconDotsVertical />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-32">
          <DropdownMenuItem variant="destructive">Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
]

function DraggableRow({ 
  row, 
  onRowClick, 
  onRescan, 
  onDelete 
}: { 
  row: Row<z.infer<typeof schema>>, 
  onRowClick: (imageName: string) => void,
  onRescan: (imageName: string, source?: string) => void,
  onDelete: (imageName: string) => void
}) {
  const { transform, transition, setNodeRef, isDragging } = useSortable({
    id: row.original.id,
  })

  const handleRowClick = (e: React.MouseEvent) => {
    // Don't navigate if clicking on interactive elements
    if ((e.target as HTMLElement).closest('button, input, select, a, [role="button"]')) {
      return
    }
    onRowClick(row.original.imageName)
  }

  const handleRescan = () => {
    onRescan(row.original.imageName, row.original.source)
  }

  const handleDelete = () => {
    onDelete(row.original.imageName)
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <TableRow
          data-state={row.getIsSelected() && "selected"}
          data-dragging={isDragging}
          ref={setNodeRef}
          className="relative z-0 data-[dragging=true]:z-10 data-[dragging=true]:opacity-80 cursor-pointer hover:bg-muted/50"
          style={{
            transform: CSS.Transform.toString(transform),
            transition: transition,
          }}
          onClick={handleRowClick}
        >
          {row.getVisibleCells().map((cell) => (
            <TableCell key={cell.id}>
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </TableCell>
          ))}
        </TableRow>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={handleRescan}>
          <IconRefresh className="mr-2 h-4 w-4" />
          Rescan Image
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={handleDelete} className="text-red-600 focus:text-red-600">
          <IconTrash className="mr-2 h-4 w-4" />
          Delete Image
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

export function DataTable({
  data: initialData,
  isFullPage = false,
}: {
  data: z.infer<typeof schema>[]
  isFullPage?: boolean
}) {
  const router = useRouter()
  const { addScanJob } = useScanning()
  
  // State for delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false)
  const [imageToDelete, setImageToDelete] = React.useState<string>("")
  
  // Group data by image name (without tag)
  const groupedData = React.useMemo(() => {
    const grouped = new Map<string, z.infer<typeof schema>[]>()
    
    initialData.forEach(item => {
      const imageName = item.image.split(':')[0] // Remove tag part
      if (!grouped.has(imageName)) {
        grouped.set(imageName, [])
      }
      grouped.get(imageName)!.push(item)
    })
    
    // Convert to array and merge data for same image names
    return Array.from(grouped.entries()).map(([imageName, items]) => {
      // Use the most recent scan as the base item
      const baseItem = items.reduce((latest, current) => 
        new Date(current.lastScan) > new Date(latest.lastScan) ? current : latest
      )
      
      // Aggregate vulnerability counts across all tags using unique CVE deduplication
      const uniqueVulns = aggregateUniqueVulnerabilitiesFromLegacyScans(items)
      const aggregatedSeverities = {
        crit: uniqueVulns.critical,
        high: uniqueVulns.high,
        med: uniqueVulns.medium,
        low: uniqueVulns.low,
      }
      
      // Calculate aggregated risk score (average weighted by severity)
      const totalVulns = items.reduce((sum, item) => 
        sum + item.severities.crit + item.severities.high + item.severities.med + item.severities.low, 0
      )
      const weightedRiskScore = totalVulns > 0 
        ? Math.round(items.reduce((sum, item) => {
            const itemTotal = item.severities.crit + item.severities.high + item.severities.med + item.severities.low
            return sum + (item.riskScore * itemTotal)
          }, 0) / totalVulns)
        : baseItem.riskScore
      
      // Aggregate other metrics
      const totalFixable = items.reduce((sum, item) => sum + item.fixable.count, 0)
      const totalVulnerabilities = aggregatedSeverities.crit + aggregatedSeverities.high + aggregatedSeverities.med + aggregatedSeverities.low
      const aggregatedFixable = {
        count: totalFixable,
        percent: totalVulnerabilities > 0 ? Math.round((totalFixable / totalVulnerabilities) * 100) : 0
      }
      
      return {
        ...baseItem,
        id: baseItem.id, // Keep original ID for key purposes
        image: imageName, // Show just the image name without tag
        imageName, // For navigation
        severities: aggregatedSeverities,
        riskScore: weightedRiskScore,
        fixable: aggregatedFixable,
        misconfigs: items.reduce((sum, item) => sum + item.misconfigs, 0),
        secrets: items.reduce((sum, item) => sum + item.secrets, 0),
        // Keep the most recent scan date
        lastScan: items.reduce((latest, current) => 
          new Date(current.lastScan) > new Date(latest) ? current.lastScan : latest
        , baseItem.lastScan),
        // Add metadata about multiple tags (deduplicated)
        _tagCount: [...new Set(items.map(item => item.image.split(':')[1] || 'latest'))].length,
        _allTags: [...new Set(items.map(item => item.image.split(':')[1] || 'latest'))].join(', ')
      }
    })
  }, [initialData])
  
  const [data, setData] = React.useState(() => groupedData)
  React.useEffect(() => {
    setData(groupedData)
  }, [groupedData])



  const [rowSelection, setRowSelection] = React.useState({})
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({
      // Hide excessive/detailed fields by default
      digestShort: false,
      sizeMb: false,
      "fixable.percent": false,
      highestCvss: false,
      misconfigs: false,
      secrets: false,
      "compliance.dockle": false,
      "delta.newCrit": false,
      "delta.resolvedTotal": false,
      baseImage: false,
      baseUpdate: false,
      signed: false,
      attested: false,
      sbomFormat: false,
      dbAge: false,
      registry: false,
      project: false,
      header: false,
      type: false,
      target: false,
      limit: false,
    })
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  )
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [pagination, setPagination] = React.useState({
    pageIndex: 0,
    pageSize: isFullPage ? 25 : 10,
  })
  const sortableId = React.useId()
  const sensors = useSensors(
    useSensor(MouseSensor, {}),
    useSensor(TouchSensor, {}),
    useSensor(KeyboardSensor, {})
  )

  const dataIds = React.useMemo<UniqueIdentifier[]>(
    () => data?.map(({ image }) => image) || [],
    [data]
  )

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
      pagination,
    },
    getRowId: (row) => row.id.toString(),
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  })

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (active && over && active.id !== over.id) {
      setData((data) => {
        const oldIndex = dataIds.indexOf(active.id)
        const newIndex = dataIds.indexOf(over.id)
        return arrayMove(data, oldIndex, newIndex)
      })
    }
  }

  const handleRowClick = (imageName: string) => {
    router.push(`/image/${encodeURIComponent(imageName)}`)
  }

  const handleRescan = async (imageName: string, source?: string) => {
    // Determine the source - default to 'registry' if not specified
    const scanSource = source || 'registry'
    const loadingToastId = toast.loading(`Starting ${scanSource} rescan for ${imageName}...`)
    
    try {
      // Use the correct API endpoint for starting scans
      const response = await fetch('/api/scans/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image: imageName,
          tag: 'latest', // You might want to handle tags differently
          source: scanSource
        }),
      })

      if (response.ok) {
        const result = await response.json()
        
        // Dismiss loading toast and show success
        toast.dismiss(loadingToastId)
        toast.success(`${scanSource.charAt(0).toUpperCase() + scanSource.slice(1)} rescan started for ${imageName}`)
        
        // Add the scan job to the scanning context so it shows in the monitor
        if (result.requestId && result.scanId) {
          addScanJob({
            requestId: result.requestId,
            scanId: result.scanId,
            imageId: '', // We don't have imageId from this context
            imageName: imageName,
            status: 'RUNNING',
            progress: 0,
            step: 'Initializing...'
          })
        }
        
        console.log('Scan started:', result)
      } else {
        const result = await response.json().catch(() => ({ error: 'Unknown error' }))
        
        // Dismiss loading toast and show error
        toast.dismiss(loadingToastId)
        toast.error(result.error || 'Failed to start rescan')
      }
    } catch (error) {
      console.error('Error starting rescan:', error)
      
      // Dismiss loading toast and show error
      toast.dismiss(loadingToastId)
      toast.error('Failed to start rescan')
    }
  }

  const handleDeleteClick = (imageName: string) => {
    setImageToDelete(imageName)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    const loadingToastId = toast.loading(`Deleting ${imageToDelete}...`)
    
    try {
      const response = await fetch(`/api/images/name/${encodeURIComponent(imageToDelete)}`, {
        method: 'DELETE',
      })
      
      if (response.ok) {
        // Dismiss loading toast and show success
        toast.dismiss(loadingToastId)
        toast.success(`${imageToDelete} deleted successfully`)
        
        // Refresh the page to update the data
        window.location.reload()
      } else {
        const result = await response.json().catch(() => ({ error: 'Unknown error' }))
        
        // Dismiss loading toast and show error
        toast.dismiss(loadingToastId)
        toast.error(result.error || 'Failed to delete image')
      }
    } catch (error) {
      console.error('Error deleting image:', error)
      
      // Dismiss loading toast and show error
      toast.dismiss(loadingToastId)
      toast.error('Failed to delete image')
    }
  }

  return (
    <Tabs
      defaultValue="outline"
      className="w-full flex-col justify-start gap-6"
    >
      <div className="flex items-center justify-between px-4 lg:px-6">
        {isFullPage && (
          <div className="flex-1">
            <h1 className="text-2xl font-bold">Image Repository</h1>
            <p className="text-muted-foreground">Comprehensive registry of all scanned container images</p>
          </div>
        )}

        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <IconLayoutColumns />
                <span className="hidden lg:inline">Customize Columns</span>
                <span className="lg:hidden">Columns</span>
                <IconChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {table
                .getAllColumns()
                .filter(
                  (column) =>
                    typeof column.accessorFn !== "undefined" &&
                    column.getCanHide()
                )
                .map((column) => {
                  return (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      className="capitalize"
                      checked={column.getIsVisible()}
                      onCheckedChange={(value) =>
                        column.toggleVisibility(!!value)
                      }
                    >
                      {column.id}
                    </DropdownMenuCheckboxItem>
                  )
                })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <TabsContent
        value="outline"
        className="relative flex flex-col gap-4 overflow-auto px-4 lg:px-6"
      >
        <div className="overflow-hidden rounded-lg border">
          <DndContext
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            onDragEnd={handleDragEnd}
            sensors={sensors}
            id={sortableId}
          >
            <Table>
              <TableHeader className="bg-muted sticky top-0 z-10">
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => {
                      return (
                        <TableHead key={header.id} colSpan={header.colSpan}>
                          {header.isPlaceholder
                            ? null
                            : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                        </TableHead>
                      )
                    })}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody className="**:data-[slot=table-cell]:first:w-8">
                {table.getRowModel().rows?.length ? (
                  <SortableContext
                    items={dataIds}
                    strategy={verticalListSortingStrategy}
                  >
                    {table.getRowModel().rows.map((row) => (
                      <DraggableRow 
                        key={row.id} 
                        row={row} 
                        onRowClick={handleRowClick}
                        onRescan={handleRescan}
                        onDelete={handleDeleteClick}
                      />
                    ))}
                  </SortableContext>
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length}
                      className="h-24 text-center"
                    >
                      No results.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </DndContext>
        </div>
        <div className="flex items-center justify-between px-4">
          <div className="text-muted-foreground hidden flex-1 text-sm lg:flex">
            {table.getFilteredSelectedRowModel().rows.length} of{" "}
            {table.getFilteredRowModel().rows.length} row(s) selected.
          </div>
          <div className="flex w-full items-center gap-8 lg:w-fit">
            <div className="hidden items-center gap-2 lg:flex">
              <Label htmlFor="rows-per-page" className="text-sm font-medium">
                Rows per page
              </Label>
              <Select
                value={`${table.getState().pagination.pageSize}`}
                onValueChange={(value) => {
                  table.setPageSize(Number(value))
                }}
              >
                <SelectTrigger size="sm" className="w-20" id="rows-per-page">
                  <SelectValue
                    placeholder={table.getState().pagination.pageSize}
                  />
                </SelectTrigger>
                <SelectContent side="top">
                  {[10, 20, 30, 40, 50].map((pageSize) => (
                    <SelectItem key={pageSize} value={`${pageSize}`}>
                      {pageSize}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex w-fit items-center justify-center text-sm font-medium">
              Page {table.getState().pagination.pageIndex + 1} of{" "}
              {table.getPageCount()}
            </div>
            <div className="ml-auto flex items-center gap-2 lg:ml-0">
              <Button
                variant="outline"
                className="hidden h-8 w-8 p-0 lg:flex"
                onClick={() => table.setPageIndex(0)}
                disabled={!table.getCanPreviousPage()}
              >
                <span className="sr-only">Go to first page</span>
                <IconChevronsLeft />
              </Button>
              <Button
                variant="outline"
                className="size-8"
                size="icon"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                <span className="sr-only">Go to previous page</span>
                <IconChevronLeft />
              </Button>
              <Button
                variant="outline"
                className="size-8"
                size="icon"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                <span className="sr-only">Go to next page</span>
                <IconChevronRight />
              </Button>
              <Button
                variant="outline"
                className="hidden size-8 lg:flex"
                size="icon"
                onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                disabled={!table.getCanNextPage()}
              >
                <span className="sr-only">Go to last page</span>
                <IconChevronsRight />
              </Button>
            </div>
          </div>
        </div>
      </TabsContent>
      <TabsContent
        value="past-performance"
        className="flex flex-col px-4 lg:px-6"
      >
        <div className="aspect-video w-full flex-1 rounded-lg border border-dashed"></div>
      </TabsContent>
      <TabsContent value="key-personnel" className="flex flex-col px-4 lg:px-6">
        <div className="aspect-video w-full flex-1 rounded-lg border border-dashed"></div>
      </TabsContent>
      <TabsContent
        value="focus-documents"
        className="flex flex-col px-4 lg:px-6"
      >
        <div className="aspect-video w-full flex-1 rounded-lg border border-dashed"></div>
      </TabsContent>
      
      {/* Delete Image Dialog */}
      <DeleteImageDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        imageName={imageToDelete}
        onConfirm={handleDeleteConfirm}
      />
    </Tabs>
  )
}

const chartData = [
  { month: "January", desktop: 186, mobile: 80 },
  { month: "February", desktop: 305, mobile: 200 },
  { month: "March", desktop: 237, mobile: 120 },
  { month: "April", desktop: 73, mobile: 190 },
  { month: "May", desktop: 209, mobile: 130 },
  { month: "June", desktop: 214, mobile: 140 },
]

const chartConfig = {
  desktop: {
    label: "Desktop",
    color: "var(--primary)",
  },
  mobile: {
    label: "Mobile",
    color: "var(--primary)",
  },
} satisfies ChartConfig

function TableCellViewer({ item }: { item: z.infer<typeof schema> }) {
  const isMobile = useIsMobile()

  return (
    <Drawer direction={isMobile ? "bottom" : "right"}>
      <DrawerTrigger asChild>
        <Button variant="link" className="text-foreground w-fit px-0 text-left">
          {item.header}
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader className="gap-1">
          <DrawerTitle>{item.header}</DrawerTitle>
          <DrawerDescription>
            Showing total visitors for the last 6 months
          </DrawerDescription>
        </DrawerHeader>
        <div className="flex flex-col gap-4 overflow-y-auto px-4 text-sm">
          {!isMobile && (
            <>
              <ChartContainer config={chartConfig}>
                <AreaChart
                  accessibilityLayer
                  data={chartData}
                  margin={{
                    left: 0,
                    right: 10,
                  }}
                >
                  <CartesianGrid vertical={false} />
                  <XAxis
                    dataKey="month"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    tickFormatter={(value) => value.slice(0, 3)}
                    hide
                  />
                  <ChartTooltip
                    cursor={false}
                    content={<ChartTooltipContent indicator="dot" />}
                  />
                  <Area
                    dataKey="mobile"
                    type="natural"
                    fill="var(--color-mobile)"
                    fillOpacity={0.6}
                    stroke="var(--color-mobile)"
                    stackId="a"
                  />
                  <Area
                    dataKey="desktop"
                    type="natural"
                    fill="var(--color-desktop)"
                    fillOpacity={0.4}
                    stroke="var(--color-desktop)"
                    stackId="a"
                  />
                </AreaChart>
              </ChartContainer>
              <Separator />
              <div className="grid gap-2">
                <div className="flex gap-2 leading-none font-medium">
                  Trending up by 5.2% this month{" "}
                  <IconTrendingUp className="size-4" />
                </div>
                <div className="text-muted-foreground">
                  Showing total visitors for the last 6 months. This is just
                  some random text to test the layout. It spans multiple lines
                  and should wrap around.
                </div>
              </div>
              <Separator />
            </>
          )}
          <form className="flex flex-col gap-4">
            <div className="flex flex-col gap-3">
              <Label htmlFor="header">Header</Label>
              <Input id="header" defaultValue={item.header} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-3">
                <Label htmlFor="type">Type</Label>
                <Select defaultValue={item.type}>
                  <SelectTrigger id="type" className="w-full">
                    <SelectValue placeholder="Select a type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Table of Contents">
                      Table of Contents
                    </SelectItem>
                    <SelectItem value="Executive Summary">
                      Executive Summary
                    </SelectItem>
                    <SelectItem value="Technical Approach">
                      Technical Approach
                    </SelectItem>
                    <SelectItem value="Design">Design</SelectItem>
                    <SelectItem value="Capabilities">Capabilities</SelectItem>
                    <SelectItem value="Focus Documents">
                      Focus Documents
                    </SelectItem>
                    <SelectItem value="Narrative">Narrative</SelectItem>
                    <SelectItem value="Cover Page">Cover Page</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-3">
                <Label htmlFor="status">Status</Label>
                <Select defaultValue={item.status}>
                  <SelectTrigger id="status" className="w-full">
                    <SelectValue placeholder="Select a status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Done">Done</SelectItem>
                    <SelectItem value="In Progress">In Progress</SelectItem>
                    <SelectItem value="Not Started">Not Started</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-3">
                <Label htmlFor="target">Target</Label>
                <Input id="target" defaultValue={item.target} />
              </div>
              <div className="flex flex-col gap-3">
                <Label htmlFor="limit">Limit</Label>
                <Input id="limit" defaultValue={item.limit} />
              </div>
            </div>
          </form>
        </div>
        <DrawerFooter>
          <Button>Submit</Button>
          <DrawerClose asChild>
            <Button variant="outline">Done</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
