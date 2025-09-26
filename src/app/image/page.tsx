"use client";

import { UnifiedTable } from "@/components/table/unified-table";
import { ColumnDefinition, ContextMenuItem } from "@/components/table/types";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useScanning } from "@/providers/ScanningProvider";
import { DeleteImageDialog } from "@/components/delete-image-dialog";
import { IconRefresh, IconTrash } from "@tabler/icons-react";
import * as React from "react";
import { ScanJobsMonitor } from "@/components/scan-jobs-monitor";
import { useScans } from "@/hooks/useScans";
import { useApp } from "@/contexts/AppContext";
import { FullPageLoading } from "@/components/ui/loading";

export default function ImageRepositoryPage() {
  const { scans, loading } = useScans();
  const { state, setPage } = useApp();
  const router = useRouter();
  const { addScanJob } = useScanning();

  // State for dialogs
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [imageToDelete, setImageToDelete] = React.useState<string>("");

  if (loading) {
    return (
      <FullPageLoading
        message="Loading Image Repository"
        description="Fetching container images and scan results..."
      />
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-2 overflow-auto">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
          <ScanJobsMonitor />
          <UnifiedTable
            data={processScansForTable(scans)}
            columns={getTableColumns()}
            features={{
              sorting: true,
              filtering: true,
              pagination: 'server',
              selection: false,
              columnVisibility: true,
              contextMenu: true,
              search: true,
            }}
            serverPagination={{
              currentPage: state.pagination.currentPage,
              totalPages: state.pagination.totalPages,
              pageSize: 25,
              totalItems: state.pagination.totalPages * 25,
              onPageChange: setPage,
            }}
            onRowClick={handleRowClick}
            contextMenuItems={getContextMenuItems}
            className="bg-card rounded-lg border shadow-xs p-6"
          />

          {/* Dialogs */}
          <DeleteImageDialog
            open={deleteDialogOpen}
            onOpenChange={setDeleteDialogOpen}
            imageName={imageToDelete}
            onConfirm={handleDeleteConfirm}
          />

        </div>
      </div>
    </div>
  );

  // The same table functions from page.tsx - reused for consistency
  function getTableColumns(): ColumnDefinition<any>[] {
    return [
      {
        key: 'image',
        header: 'Image',
        type: 'multi-text',
        sortable: true,
        accessorFn: (row: any) => ({
          primary: row.imageName || row.image.split(':')[0],
          secondary: row._tagCount > 1 ? `${row._tagCount} tags: ${row._allTags}` : undefined
        })
      },
      {
        key: 'status',
        header: 'Status',
        type: 'status',
        sortable: true,
        cellProps: { imageIdField: 'imageId', imageNameField: 'imageName' }
      },
      {
        key: 'riskScore',
        header: 'Risk Score',
        type: 'badge',
        sortable: true,
      },
      {
        key: 'severities',
        header: 'Findings',
        type: 'toggle-group',
      },
      {
        key: 'compliance.dockle',
        header: 'Dockle',
        type: 'badge',
        accessorFn: (row: any) => row.compliance?.dockle || 'N/A',
      },
      {
        key: 'registry',
        header: 'Registry',
        type: 'registry',
      },
      {
        key: 'lastScan',
        header: 'Last Scan',
        type: 'timestamp',
        sortable: true,
        cellProps: { showRelative: true }
      },
    ]
  }

  function processScansForTable(scans: any[]) {
    const grouped = new Map<string, any[]>()

    scans.forEach(item => {
      const imageName = typeof item.image === 'string'
        ? item.image.split(':')[0]
        : item.imageName
      if (!grouped.has(imageName)) {
        grouped.set(imageName, [])
      }
      grouped.get(imageName)!.push(item)
    })

    return Array.from(grouped.entries()).map(([imageName, items]) => {
      const baseItem = items.reduce((latest, current) =>
        new Date(current.lastScan) > new Date(latest.lastScan) ? current : latest
      )

      const aggregatedSeverities = baseItem.severities
      const totalVulns = items.reduce((sum, item) =>
        sum + item.severities.crit + item.severities.high + item.severities.med + item.severities.low, 0
      )
      const weightedRiskScore = totalVulns > 0
        ? Math.round(items.reduce((sum, item) => {
            const itemTotal = item.severities.crit + item.severities.high + item.severities.med + item.severities.low
            return sum + (item.riskScore * itemTotal)
          }, 0) / totalVulns)
        : baseItem.riskScore

      return {
        ...baseItem,
        imageName,
        severities: aggregatedSeverities,
        riskScore: weightedRiskScore,
        misconfigs: items.reduce((sum, item) => sum + item.misconfigs, 0),
        secrets: items.reduce((sum, item) => sum + item.secrets, 0),
        lastScan: items.reduce((latest, current) =>
          new Date(current.lastScan) > new Date(latest) ? current.lastScan : latest
        , baseItem.lastScan),
        _tagCount: [...new Set(items.map(item => {
          const tag = typeof item.image === 'string'
            ? item.image.split(':')[1] || 'latest'
            : 'latest'
          return tag
        }))].length,
        _allTags: [...new Set(items.map(item => {
          const tag = typeof item.image === 'string'
            ? item.image.split(':')[1] || 'latest'
            : 'latest'
          return tag
        }))].join(', '),
      }
    })
  }

  function handleRowClick(row: any) {
    router.push(`/image/${encodeURIComponent(row.imageName)}`)
  }

  function getContextMenuItems(row: any): ContextMenuItem<any>[] {
    const tagCount = row._tagCount || 1
    const tags = row._allTags?.split(', ').filter(Boolean) || []
    const items: ContextMenuItem<any>[] = []

    if (tagCount > 1) {
      items.push({
        label: 'Rescan Image',
        icon: <IconRefresh className="mr-2 h-4 w-4" />,
        action: () => {}, // No-op for parent with subItems
        subItems: tags.map((tag: string) => ({
          label: `Scan :${tag}`,
          icon: <IconRefresh className="mr-2 h-4 w-4" />,
          action: () => handleRescan(row.imageName, row.imageId, tag),
        })),
      })
    } else {
      items.push({
        label: 'Rescan Image',
        icon: <IconRefresh className="mr-2 h-4 w-4" />,
        action: () => handleRescan(row.imageName, row.imageId),
      })
    }

    items.push({
      label: 'Delete Image',
      icon: <IconTrash className="mr-2 h-4 w-4" />,
      action: () => handleDelete(row.imageName),
      variant: 'destructive',
      separator: true,
    })

    return items
  }

  async function handleRescan(imageName: string, imageId?: string, tag?: string) {
    const displayTag = tag || 'latest'
    const loadingToastId = toast.loading(`Starting rescan for ${imageName}:${displayTag}...`)

    try {
      // Use the new rescan endpoint that fetches data from the database
      // Only pass tag if it's explicitly provided (not defaulted to 'latest')
      const requestBody: any = { imageId: imageId };
      if (tag) {
        requestBody.tag = tag;
      }

      const response = await fetch('/api/scans/rescan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      if (response.ok) {
        const result = await response.json()
        toast.dismiss(loadingToastId)
        toast.success(`Rescan started for ${imageName}:${displayTag}`)

        if (result.requestId && result.scanId) {
          addScanJob({
            requestId: result.requestId,
            scanId: result.scanId,
            imageId: '',
            imageName: imageName,
            status: 'RUNNING',
            progress: 0,
            step: 'Initializing...'
          })
        }
      } else {
        toast.dismiss(loadingToastId)
        toast.error('Failed to start rescan')
      }
    } catch (error) {
      toast.dismiss(loadingToastId)
      toast.error('Failed to start rescan')
    }
  }

  function handleDelete(imageName: string) {
    setImageToDelete(imageName)
    setDeleteDialogOpen(true)
  }

  async function handleDeleteConfirm() {
    const loadingToastId = toast.loading(`Deleting ${imageToDelete}...`)

    try {
      const response = await fetch(`/api/images/name/${encodeURIComponent(imageToDelete)}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        toast.dismiss(loadingToastId)
        toast.success(`${imageToDelete} deleted successfully`)
        window.location.reload()
      } else {
        toast.dismiss(loadingToastId)
        toast.error('Failed to delete image')
      }
    } catch (error) {
      toast.dismiss(loadingToastId)
      toast.error('Failed to delete image')
    }
  }
}
