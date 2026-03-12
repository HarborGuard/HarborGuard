"use client";

import { VulnerabilityScatterplot } from "@/components/vulnerability-scatterplot";
import { UnifiedTable } from "@/components/table/unified-table";
import { ColumnDefinition, ContextMenuItem } from "@/components/table/types";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useScanning } from "@/contexts/ScanningContext";
import { DeleteImageDialog } from "@/components/delete-image-dialog";
import { IconRefresh, IconTrash } from "@tabler/icons-react";
import * as React from "react";
import { SectionCards } from "@/components/section-cards";
import { Skeleton } from "@/components/ui/skeleton";
import { useScans } from "@/hooks/useScans";
import { getImageName } from "@/lib/image-utils";
import { groupScansByImage } from "@/lib/scan-table-utils";

export default function Page() {
  const { scans, stats, loading, dataReady, error } = useScans();
  const router = useRouter();
  const { addScanJob } = useScanning();

  // State for dialogs
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [imageToDelete, setImageToDelete] = React.useState<string>("");

  // Show skeleton until data is fully processed and ready to display
  const showSkeleton = loading || !dataReady;

  // Create mock data for loading state to match the SectionCards interface
  const mockData = Array.from({ length: 5 }, (_, i) => ({
    id: i,
    riskScore: 0,
    severities: { crit: 0, high: 0, med: 0, low: 0 },
    status: "Loading",
    misconfigs: 0,
    secrets: 0,
  }));

  const mockStats = {
    totalScans: 0,
    vulnerabilities: { critical: 0, high: 0, medium: 0, low: 0, total: 0 },
    avgRiskScore: 0,
    blockedScans: 0,
    completeScans: 0,
    completionRate: 0,
  };

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen text-red-500">
        Error: {error}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="@container/main flex flex-col gap-2 p-4 lg:p-6">
        <SectionCards
          loading={showSkeleton}
          scanData={showSkeleton ? mockData : scans}
          stats={showSkeleton ? mockStats : stats}
        />
        {showSkeleton ? (
          <>
            {/* VulnerabilityScatterplot Skeleton */}
            <div className="bg-card rounded-lg border shadow-xs">
              <div className="mb-4">
                <Skeleton className="h-6 w-64 mb-2" />
                <Skeleton className="h-4 w-96" />
              </div>
              <div className="mb-4 flex justify-end gap-2">
                <Skeleton className="h-8 w-12" />
                <Skeleton className="h-8 w-12" />
                <Skeleton className="h-8 w-12" />
                <Skeleton className="h-8 w-12" />
              </div>
              <Skeleton className="h-[250px] w-full" />
            </div>

            {/* DataTable Skeleton */}
            <div className="bg-card rounded-lg border shadow-xs">
              <Skeleton className="h-6 w-32 mb-4" />
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-8 gap-4 py-3 items-center"
                  >
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-6 w-12" />
                    <div className="flex gap-1">
                      <Skeleton className="h-5 w-8" />
                      <Skeleton className="h-5 w-8" />
                      <Skeleton className="h-5 w-8" />
                    </div>
                    <Skeleton className="h-4 w-8" />
                    <Skeleton className="h-4 w-12" />
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-6 w-16" />
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            <VulnerabilityScatterplot />
            <UnifiedTable
              data={processScansForTable(scans)}
              columns={getTableColumns()}
              features={{
                sorting: true,
                filtering: true,
                pagination: true,
                selection: false,
                columnVisibility: true,
                contextMenu: true,
                search: true,
              }}
              onRowClick={handleRowClick}
              contextMenuItems={getContextMenuItems}
              initialSorting={[{ id: "lastScan", desc: true }]}
              className="bg-card rounded-lg border shadow-xs p-6"
            />

            {/* Dialogs */}
            <DeleteImageDialog
              open={deleteDialogOpen}
              onOpenChange={setDeleteDialogOpen}
              imageName={imageToDelete}
              onConfirm={handleDeleteConfirm}
            />

          </>
        )}
      </div>
    </div>
  );

  // Table column definitions
  function getTableColumns(): ColumnDefinition<any>[] {
    return [
      {
        key: 'image',
        header: 'Image',
        type: 'multi-text',
        sortable: true,
        accessorFn: (row: any) => ({
          primary: row.imageName || getImageName(row.image),
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
      {
        key: 'digestShort',
        header: 'Digest',
        type: 'text',
        visible: false,
      },
      {
        key: 'platform',
        header: 'Platform',
        type: 'badge',
        visible: false,
      },
      {
        key: 'sizeMb',
        header: 'Size (MB)',
        type: 'text',
        visible: false,
      },
      {
        key: 'highestCvss',
        header: 'Highest CVSS',
        type: 'text',
        visible: false,
      },
      {
        key: 'misconfigs',
        header: 'Misconfigs',
        type: 'text',
        visible: false,
      },
      {
        key: 'secrets',
        header: 'Secrets',
        type: 'text',
        visible: false,
      },
    ]
  }

  // Process scans data for table (group by image name)
  function processScansForTable(scans: any[]) {
    return groupScansByImage(scans);
  }

  // Handle row click
  function handleRowClick(row: any) {
    router.push(`/images/${encodeURIComponent(row.imageName)}`)
  }

  // Get context menu items
  function getContextMenuItems(row: any): ContextMenuItem<any>[] {
    const tagCount = row._tagCount || 1
    const tags = row._allTags?.split(', ').filter(Boolean) || []

    const items: ContextMenuItem<any>[] = []

    if (tagCount > 1) {
      items.push({
        label: 'Rescan Image',
        icon: <IconRefresh className="mr-2 h-4 w-4" />,
        action: () => {}, // No-op for parent with subItems
        subItems: [
          ...tags.map((tag: string) => ({
            label: `Scan :${tag}`,
            icon: <IconRefresh className="mr-2 h-4 w-4" />,
            action: () => handleRescan(row.imageName, row.imageId, tag),
          })),
          {
            label: '',
            action: () => {},
            separator: true,
          },
          {
            label: `Scan All ${tags.length} Tags`,
            icon: <IconRefresh className="mr-2 h-4 w-4" />,
            action: () => handleRescanAll(row, tags),
          },
        ],
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

  // Handle rescan
  async function handleRescan(imageName: string, imageId?: string, tag?: string) {
    const displayTag = tag || 'latest'
    const loadingToastId = toast.loading(`Starting rescan for ${imageName}:${displayTag}...`)

    console.log(imageId, tag)

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
        const result = await response.json().catch(() => ({ error: 'Unknown error' }))
        toast.dismiss(loadingToastId)
        toast.error(result.error || 'Failed to start rescan')
      }
    } catch (error) {
      toast.dismiss(loadingToastId)
      toast.error('Failed to start rescan')
    }
  }

  // Handle rescan all tags
  async function handleRescanAll(row: any, tags: string[]) {
    const imageName = row.imageName
    const imageId = row.imageId
    const loadingToastId = toast.loading(`Starting scans for ${tags.length} tags of ${imageName}...`)

    try {
      for (const tag of tags) {
        await new Promise(resolve => setTimeout(resolve, 500))
        await handleRescan(imageName, imageId, tag)
      }

      toast.dismiss(loadingToastId)
      toast.success(`Started scans for all ${tags.length} tags of ${imageName}`)
    } catch (error) {
      toast.dismiss(loadingToastId)
      toast.error('Failed to start all scans')
    }
  }

  // Handle delete
  function handleDelete(imageName: string) {
    setImageToDelete(imageName)
    setDeleteDialogOpen(true)
  }

  // Handle delete confirm
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
        const result = await response.json().catch(() => ({ error: 'Unknown error' }))
        toast.dismiss(loadingToastId)
        toast.error(result.error || 'Failed to delete image')
      }
    } catch (error) {
      toast.dismiss(loadingToastId)
      toast.error('Failed to delete image')
    }
  }
}
