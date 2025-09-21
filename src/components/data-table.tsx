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
  IconUpload,
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
import { toast } from "sonner"
import { buildRescanRequest } from "@/lib/registry/registry-utils"
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
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu"
import { DeleteImageDialog } from "@/components/delete-image-dialog"
import { ExportImageDialogEnhanced } from "@/components/export-image-dialog-enhanced"
import { useScanning } from "@/providers/ScanningProvider"
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
  highestCvss: z.number().min(0).max(10).optional(),
  misconfigs: z.number().int().nonnegative().default(0),
  secrets: z.number().int().nonnegative().default(0),

  // Compliance / policy
  compliance: complianceSchema.optional(),

  // Metadata  
  registry: z.string().optional(),

  // Timestamps / status
  lastScan: z.string().datetime(),                     // ISO 8601
  status: z.enum(["Complete", "Queued", "Error", "Prior"]),

  
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

function createColumns(handleDeleteClick: (imageName: string) => void): ColumnDef<z.infer<typeof schema>>[] {
  return [
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
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="h-auto p-0 hover:bg-transparent font-medium"
        >
          Image
          {column.getIsSorted() === "asc" ? (
            <IconChevronDown className="ml-2 h-4 w-4 rotate-180" />
          ) : column.getIsSorted() === "desc" ? (
            <IconChevronDown className="ml-2 h-4 w-4" />
          ) : null}
        </Button>
      )
    },
    cell: ({ row }) => {
      const imageData = row.original.image;
      // Handle both string and object formats - show only image name
      const imageName = typeof imageData === 'string' 
        ? imageData.split(':')[0] // Extract just the image name
        : (imageData as any)?.name; // Use the name property directly
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
    enableSorting: true,
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
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="h-auto p-0 hover:bg-transparent font-medium"
        >
          Status
          {column.getIsSorted() === "asc" ? (
            <IconChevronDown className="ml-2 h-4 w-4 rotate-180" />
          ) : column.getIsSorted() === "desc" ? (
            <IconChevronDown className="ml-2 h-4 w-4" />
          ) : null}
        </Button>
      )
    },
    cell: ({ row }) => {
      const imageData = row.original.image;
      const imageName = row.original.imageName || 
        (typeof imageData === 'string' 
          ? imageData.split(':')[0] 
          : (imageData as any)?.name);
      
      return (
        <ImageStatusCell 
          imageName={imageName}
          imageId={row.original.imageId}
          status={row.original.status}
        />
      );
    },
  },
  
  {
    accessorKey: "sizeMb",
    header: "Size (MB)",
    cell: ({ row }) => row.original.sizeMb || "N/A",
  },

  // Risk & vuln summary
  {
    accessorKey: "riskScore",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="h-auto p-0 hover:bg-transparent font-medium"
        >
          Risk Score
          {column.getIsSorted() === "asc" ? (
            <IconChevronDown className="ml-2 h-4 w-4 rotate-180" />
          ) : column.getIsSorted() === "desc" ? (
            <IconChevronDown className="ml-2 h-4 w-4" />
          ) : null}
        </Button>
      )
    },
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
      // Check both possible data structures
      const severities = row.original.severities || {};
      const { crit = 0, high = 0, med = 0, low = 0 } = severities;
      const total = crit + high + med + low;
      
      
      if (total === 0) {
        return <Badge variant="outline" className="text-xs">No vulnerabilities</Badge>
      }
      
      return (
        <div className="flex flex-wrap gap-1">
          {crit > 0 && (
            <Badge variant="destructive" className="text-xs px-1.5 py-0.5">
              C: {crit}
            </Badge>
          )}
          {high > 0 && (
            <Badge variant="destructive" className="text-xs px-1.5 py-0.5 !bg-orange-500">
              H: {high}
            </Badge>
          )}
          {med > 0 && (
            <Badge variant="secondary" className="text-xs px-1.5 py-0.5 border-1">
              M: {med}
            </Badge>
          )}
          {low > 0 && (
            <Badge variant="outline" className="text-xs px-1.5 py-0.5">
              L: {low}
            </Badge>
          )}
        </div>
      );
    },
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
    cell: ({ row }) => {
      const dockleGrade = row.original.compliance?.dockle;
      if (!dockleGrade) {
        return <Badge variant="outline" className="text-xs">Not scanned</Badge>;
      }
      const variant = dockleGrade === "A" ? "default" : 
                     dockleGrade === "B" ? "secondary" : "destructive";
      return <Badge variant={variant} className="text-xs">{dockleGrade}</Badge>;
    },
  },
  {
    accessorKey: "registry",
    header: "Registry",
    cell: ({ row }) => {
      // Simply use the registry from the image object
      const imageData = row.original.image;
      const registry = typeof imageData === 'object' && imageData !== null 
        ? (imageData as any).registry || "Docker Hub"
        : "Docker Hub";
      
      return (
        <Badge 
          variant={registry === "Docker Hub" ? "default" : "outline"}
          className="text-xs"
        >
          {registry}
        </Badge>
      );
    },
  },



  // Timestamps / status
  {
    accessorKey: "lastScan",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="h-auto p-0 hover:bg-transparent font-medium"
        >
          Last Scan
          {column.getIsSorted() === "asc" ? (
            <IconChevronDown className="ml-2 h-4 w-4 rotate-180" />
          ) : column.getIsSorted() === "desc" ? (
            <IconChevronDown className="ml-2 h-4 w-4" />
          ) : null}
        </Button>
      )
    },
    cell: ({ row }) => {
      const lastScan = row.original.lastScan;
      
      if (!lastScan) return "N/A";
      
      try {
        const date = new Date(lastScan);
        if (isNaN(date.getTime())) {
          return "Invalid Date";
        }
        return date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } catch (error) {
        return "Invalid Date";
      }
    },
  }
]
}

function DraggableRow({ 
  row, 
  onRowClick, 
  onRescan, 
  onDelete,
  onExport 
}: { 
  row: Row<z.infer<typeof schema>>, 
  onRowClick: (imageName: string) => void,
  onRescan: (imageName: string, source?: string, tag?: string) => void,
  onDelete: (imageName: string) => void,
  onExport: (imageName: string, tag: string, allTags: string[]) => void
}) {
  const { transform, transition, setNodeRef, isDragging } = useSortable({
    id: row.original.id,
  })
  const { addScanJob } = useScanning()

  const handleRowClick = (e: React.MouseEvent) => {
    // Don't navigate if clicking on interactive elements
    if ((e.target as HTMLElement).closest('button, input, select, a, [role="button"]')) {
      return
    }
    onRowClick(row.original.imageName)
  }

  const handleRescan = (tag?: string) => {
    // If no tag is provided, extract it from the image field
    let actualTag = tag;
    if (!actualTag) {
      // Handle both string and object formats for image field
      const imageData = row.original.image;
      if (typeof imageData === 'string') {
        // Parse tag from string (e.g., "postgres:15" -> "15")
        const imageParts = imageData.split(':');
        actualTag = imageParts.length > 1 ? imageParts[imageParts.length - 1] : 'latest';
      } else if (typeof imageData === 'object' && imageData) {
        // If it's an object, get the tag property
        actualTag = (imageData as any).tag || 'latest';
      } else {
        actualTag = 'latest';
      }
    }
    onRescan(row.original.imageName, row.original.source, actualTag)
  }

  const handleRescanAll = async () => {
    const tags = (row.original as any)._allTags?.split(', ').filter(Boolean) || ['latest']
    const imageName = row.original.imageName
    const source = row.original.source
    
    // Show loading toast
    const loadingToastId = toast.loading(`Starting scans for ${tags.length} tags of ${imageName}...`)
    
    try {
      // Start all scans with a small delay between each
      for (const tag of tags) {
        await new Promise(resolve => setTimeout(resolve, 500)) // 500ms delay between scans
        onRescan(imageName, source, tag)
      }
      
      toast.dismiss(loadingToastId)
      toast.success(`Started scans for all ${tags.length} tags of ${imageName}`)
    } catch (error) {
      toast.dismiss(loadingToastId)
      toast.error('Failed to start all scans')
    }
  }

  const handleDelete = () => {
    onDelete(row.original.imageName)
  }
  
  const handleExport = () => {
    const imageName = row.original.imageName
    const currentTag = (row.original as any).tag || 'latest'
    const allTags = (row.original as any)._allTags?.split(', ').filter(Boolean) || [currentTag]
    onExport(imageName, currentTag, allTags)
  }
  
  // Get tag information
  const tagCount = (row.original as any)._tagCount || 1
  const tags = (row.original as any)._allTags?.split(', ').filter(Boolean) || []

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
        {tagCount > 1 ? (
          <ContextMenuSub>
            <ContextMenuSubTrigger className="flex items-center">
              <IconRefresh className="mr-2 h-4 w-4" />
              Rescan Image
              <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                {tagCount} tags
                <IconChevronRight className="h-3 w-3" />
              </span>
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="min-w-[200px]">
              {tags.map((tag: string) => (
                <ContextMenuItem 
                  key={tag}
                  onSelect={() => handleRescan(tag)}
                  className="flex items-center"
                >
                  <IconRefresh className="mr-2 h-4 w-4" />
                  <span className="flex-1">Scan :{tag}</span>
                </ContextMenuItem>
              ))}
              <ContextMenuSeparator />
              <ContextMenuItem 
                onSelect={handleRescanAll}
                className="flex items-center font-medium"
              >
                <IconRefresh className="mr-2 h-4 w-4" />
                <span className="flex-1">Scan All {tags.length} Tags</span>
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
        ) : (
          <ContextMenuItem onSelect={() => handleRescan()}>
            <IconRefresh className="mr-2 h-4 w-4" />
            Rescan Image
          </ContextMenuItem>
        )}
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
  serverSidePagination = false,
  currentPage,
  totalPages,
  onPageChange,
}: {
  data: z.infer<typeof schema>[]
  isFullPage?: boolean
  serverSidePagination?: boolean
  currentPage?: number
  totalPages?: number
  onPageChange?: (page: number) => void
}) {
  const router = useRouter()
  const { addScanJob } = useScanning()
  
  // State for delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false)
  const [imageToDelete, setImageToDelete] = React.useState<string>("")
  
  // State for export dialog
  const [exportDialogOpen, setExportDialogOpen] = React.useState(false)
  const [imageToExport, setImageToExport] = React.useState<{name: string, tag?: string, allTags?: string[]}>({name: ""})
  
  // Group data by image name (without tag)
  const groupedData = React.useMemo(() => {
    const grouped = new Map<string, z.infer<typeof schema>[]>()
    
    initialData.forEach(item => {
      // Handle both string and object formats for item.image
      const imageName = typeof item.image === 'string'
        ? item.image.split(':')[0]
        : (item.image as any)?.name || 'unknown'
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
      
      // Use the actual severities from the most recent scan instead of broken aggregation
      // TODO: Fix aggregateUniqueVulnerabilitiesFromLegacyScans function when CVE deduplication is needed
      const aggregatedSeverities = baseItem.severities
      
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
      
      
      // Collect all registries from grouped items
      const allRegistries = new Set<string>();
      items.forEach(item => {
        const imageSource = typeof item.image === 'object' ? (item.image as any)?.source : null;
        const reg = typeof item.image === 'object' ? (item.image as any)?.registry : null;
        const src = item.source;
        
        if (src === "local") {
          allRegistries.add("local");
        } else if (imageSource === "REGISTRY_PRIVATE" || src === "REGISTRY_PRIVATE") {
          allRegistries.add("generic");
        } else if (!reg || reg === null) {
          allRegistries.add("docker.io");
        } else {
          allRegistries.add(reg);
        }
      });
      
      return {
        ...baseItem,
        id: baseItem.id, // Keep original ID for key purposes
        image: baseItem.image, // Keep the original image data (object or string)
        imageName, // For navigation
        severities: aggregatedSeverities,
        riskScore: weightedRiskScore,
        misconfigs: items.reduce((sum, item) => sum + item.misconfigs, 0),
        secrets: items.reduce((sum, item) => sum + item.secrets, 0),
        // Keep the most recent scan date
        lastScan: items.reduce((latest, current) => 
          new Date(current.lastScan) > new Date(latest) ? current.lastScan : latest
        , baseItem.lastScan),
        // Add metadata about multiple tags (deduplicated)
        _tagCount: [...new Set(items.map(item => {
          const tag = typeof item.image === 'string'
            ? item.image.split(':')[1] || 'latest'
            : (item.image as any)?.tag || 'latest'
          return tag
        }))].length,
        _allTags: [...new Set(items.map(item => {
          const tag = typeof item.image === 'string'
            ? item.image.split(':')[1] || 'latest'
            : (item.image as any)?.tag || 'latest'
          return tag
        }))].join(', '),
        // Store all registries for this image
        _allRegistries: Array.from(allRegistries)
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
      // Default: Show only 6 most important columns
      // Keep visible: image, status, riskScore, severities, lastScan, registry (6 columns)
      
      // Hide additional data columns 
      digestShort: false,
      platform: false,
      sizeMb: false,
      highestCvss: false,
      misconfigs: false,
      secrets: false,
      "compliance.dockle": false,
      registry: true,
    })
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  )
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: "lastScan", desc: true } // Default sort by most recent scan
  ])
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

  const handleDeleteClick = (imageName: string) => {
    setImageToDelete(imageName)
    setDeleteDialogOpen(true)
  }

  const dataIds = React.useMemo<UniqueIdentifier[]>(
    () => data?.map(({ image }) => typeof image === 'string' ? image : `${(image as any)?.name}:${(image as any)?.tag}`) || [],
    [data]
  )

  const columns = React.useMemo(() => createColumns(handleDeleteClick), [handleDeleteClick])

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

  const handleRescan = async (imageName: string, source?: string, tag?: string) => {
    // Determine the source - default to 'registry' if not specified
    const scanSource = source || 'registry'
    const actualTag = tag || 'latest'
    const loadingToastId = toast.loading(`Starting ${scanSource} rescan for ${imageName}:${actualTag}...`)
    
    // Find the row data to get registry information
    const rowData = data.find(row => row.imageName === imageName)
    const imageData = rowData?.image
    const registry = typeof imageData === 'object' && imageData !== null 
      ? (imageData as any).registry 
      : undefined
    
    try {
      // Build request using utility function
      const requestBody = buildRescanRequest(imageName, actualTag, registry, scanSource)
      
      // Use the correct API endpoint for starting scans
      const response = await fetch('/api/scans/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      })

      if (response.ok) {
        const result = await response.json()
        
        // Dismiss loading toast and show success
        toast.dismiss(loadingToastId)
        toast.success(`${scanSource.charAt(0).toUpperCase() + scanSource.slice(1)} rescan started for ${imageName}:${actualTag}`)
        
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

  const handleExport = (imageName: string, tag: string, allTags: string[]) => {
    setImageToExport({ name: imageName, tag, allTags })
    setExportDialogOpen(true)
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
                        onExport={handleExport}
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
              Page {serverSidePagination ? (currentPage || 1) : (table.getState().pagination.pageIndex + 1)} of{" "}
              {serverSidePagination ? (totalPages || 1) : table.getPageCount()}
            </div>
            <div className="ml-auto flex items-center gap-2 lg:ml-0">
              <Button
                variant="outline"
                className="hidden h-8 w-8 p-0 lg:flex"
                onClick={() => {
                  if (serverSidePagination && onPageChange) {
                    onPageChange(1)
                  } else {
                    table.setPageIndex(0)
                  }
                }}
                disabled={serverSidePagination ? currentPage === 1 : !table.getCanPreviousPage()}
              >
                <span className="sr-only">Go to first page</span>
                <IconChevronsLeft />
              </Button>
              <Button
                variant="outline"
                className="size-8"
                size="icon"
                onClick={() => {
                  if (serverSidePagination && onPageChange && currentPage) {
                    onPageChange(currentPage - 1)
                  } else {
                    table.previousPage()
                  }
                }}
                disabled={serverSidePagination ? currentPage === 1 : !table.getCanPreviousPage()}
              >
                <span className="sr-only">Go to previous page</span>
                <IconChevronLeft />
              </Button>
              <Button
                variant="outline"
                className="size-8"
                size="icon"
                onClick={() => {
                  if (serverSidePagination && onPageChange && currentPage) {
                    onPageChange(currentPage + 1)
                  } else {
                    table.nextPage()
                  }
                }}
                disabled={serverSidePagination ? currentPage === totalPages : !table.getCanNextPage()}
              >
                <span className="sr-only">Go to next page</span>
                <IconChevronRight />
              </Button>
              <Button
                variant="outline"
                className="hidden size-8 lg:flex"
                size="icon"
                onClick={() => {
                  if (serverSidePagination && onPageChange && totalPages) {
                    onPageChange(totalPages)
                  } else {
                    table.setPageIndex(table.getPageCount() - 1)
                  }
                }}
                disabled={serverSidePagination ? currentPage === totalPages : !table.getCanNextPage()}
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
      
      {/* Export Image Dialog */}
      <ExportImageDialogEnhanced
        open={exportDialogOpen}
        onOpenChange={(open) => {
          setExportDialogOpen(open)
          if (!open) {
            setImageToExport({name: ""})
          }
        }}
        imageName={imageToExport.name}
        imageTag={imageToExport.tag || ''}
        patchedTarPath=""
        patchOperationId=""
      />
    </Tabs>
  )
}
