"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  IconCalendar,
  IconClock,
  IconTrendingUp,
  IconTrendingDown,
  IconShield,
  IconCheck,
  IconX,
  IconDownload,
  IconTrash,
  IconBrandDocker,
  IconServer,
  IconCloud,
  IconUpload,
} from "@tabler/icons-react"

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
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { toast } from "sonner"
import { ExportImageDialogEnhanced } from "@/components/export-image-dialog-enhanced"

// Component handles its own data formatting since historical scans are pre-formatted

interface HistoricalScan {
  id: number
  scanId: string // Real scan ID for navigation
  scanDate: string
  version: string
  registry?: string // Registry location
  source?: string // Scan source (local, registry, etc)
  riskScore: number
  severities: {
    crit: number
    high: number
    med: number
    low: number
  }
  status: string
  scanDuration: string
  newVulns: number
  resolvedVulns: number
  misconfigs: number
  secrets: number
  compliance: {
    dockle: string
  }
  dbVersion: string
  scanEngine: string
}

interface HistoricalScansTableProps {
  data: HistoricalScan[]
  imageId?: string
  onScanDeleted?: () => void
}

export function HistoricalScansTable({ data, imageId, onScanDeleted }: HistoricalScansTableProps) {
  const router = useRouter()
  const [deletingScanId, setDeletingScanId] = React.useState<string | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = React.useState(false)
  const [exportDialogOpen, setExportDialogOpen] = React.useState(false)
  const [selectedScanForExport, setSelectedScanForExport] = React.useState<HistoricalScan | null>(null)
  
  // Data is already formatted for display
  const formattedScans = data

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  const getRiskScoreTrend = (currentScore: number, previousScore?: number) => {
    if (!previousScore) return null
    if (currentScore > previousScore) return "up"
    if (currentScore < previousScore) return "down"
    return "same"
  }

  const getComplianceBadge = (status: string) => {
    switch (status) {
      case "Pass":
        return <Badge variant="default" className="text-xs"><IconCheck className="w-3 h-3 mr-1" />Pass</Badge>
      case "Fail":
        return <Badge variant="destructive" className="text-xs"><IconX className="w-3 h-3 mr-1" />Fail</Badge>
      case "A":
        return <Badge variant="default" className="text-xs">A</Badge>
      case "B":
        return <Badge variant="secondary" className="text-xs">B</Badge>
      case "C":
      case "D":
        return <Badge variant="destructive" className="text-xs">{status}</Badge>
      default:
        return <Badge variant="secondary" className="text-xs">{status}</Badge>
    }
  }

  const handleRowClick = (scanId: string) => {
    if (imageId) {
      router.push(`/image/${encodeURIComponent(imageId)}/${scanId}`)
    }
  }

  const handleDownload = async (scanId: string, e: React.MouseEvent) => {
    e.stopPropagation() // Prevent row click
    if (!imageId) return
    
    try {
      const response = await fetch(`/api/image/${encodeURIComponent(imageId)}/scan/${scanId}/download`)
      if (!response.ok) {
        throw new Error('Download failed')
      }
      
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${imageId.replace('/', '_')}_${scanId}_reports.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Download failed:', error)
      // Could add toast notification here
    }
  }

  const handleDeleteClick = (scanId: string) => {
    setDeletingScanId(scanId)
    setShowDeleteDialog(true)
  }

  const handleDeleteConfirm = async () => {
    if (!deletingScanId) return
    
    try {
      const response = await fetch(`/api/scans/${deletingScanId}`, {
        method: 'DELETE',
      })
      
      if (!response.ok) {
        throw new Error('Failed to delete scan')
      }
      
      toast.success('Scan deleted successfully')
      onScanDeleted?.() // Refresh the data
      
    } catch (error) {
      console.error('Delete failed:', error)
      toast.error('Failed to delete scan')
    } finally {
      setShowDeleteDialog(false)
      setDeletingScanId(null)
    }
  }

  const handleDeleteCancel = () => {
    setShowDeleteDialog(false)
    setDeletingScanId(null)
  }

  const handleExport = (scan: HistoricalScan) => {
    setSelectedScanForExport(scan)
    setExportDialogOpen(true)
  }

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Scan Date</TableHead>
            <TableHead>Version</TableHead>
            <TableHead>Registry</TableHead>
            <TableHead>Risk Score</TableHead>
            <TableHead>Findings</TableHead>
            <TableHead>Changes</TableHead>
            <TableHead>Compliance</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {formattedScans.map((scan, index) => {
            const previousScan = formattedScans[index + 1]
            const riskTrend = getRiskScoreTrend(scan.riskScore, previousScan?.riskScore)
            const { crit, high, med, low } = scan.severities

            const handleScanRowClick = (e: React.MouseEvent) => {
              // Don't navigate if clicking on interactive elements
              if ((e.target as HTMLElement).closest('button, [role="button"]')) {
                return
              }
              handleRowClick(scan.scanId)
            }

            return (
              <ContextMenu key={scan.id}>
                <ContextMenuTrigger asChild>
                  <TableRow 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={handleScanRowClick}
                  >
                <TableCell>
                  <div className="flex items-center gap-2">
                    <IconCalendar className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{formatDate(scan.scanDate)}</p>
                      <p className="text-xs text-muted-foreground">{scan.scanEngine}</p>
                    </div>
                  </div>
                </TableCell>
                
                <TableCell>
                  <Badge variant="outline">{scan.version}</Badge>
                </TableCell>
                
                <TableCell>
                  {scan.registry && (
                    <Badge 
                      variant={
                        scan.registry === 'local' ? 'secondary' : 
                        scan.registry === 'docker.io' ? 'default' : 
                        'outline'
                      }
                      className="flex items-center gap-1 w-fit"
                    >
                      {scan.registry === 'local' ? (
                        <>
                          <IconServer className="h-3 w-3" />
                          Local Docker
                        </>
                      ) : scan.registry === 'docker.io' ? (
                        <>
                          <IconBrandDocker className="h-3 w-3" />
                          Docker Hub
                        </>
                      ) : (
                        <>
                          <IconCloud className="h-3 w-3" />
                          {scan.registry}
                        </>
                      )}
                    </Badge>
                  )}
                </TableCell>
                
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Badge variant={scan.riskScore > 70 ? "destructive" : scan.riskScore > 40 ? "secondary" : "default"}>
                      {scan.riskScore}
                    </Badge>
                    {riskTrend === "up" && <IconTrendingUp className="h-4 w-4 text-red-500" />}
                    {riskTrend === "down" && <IconTrendingDown className="h-4 w-4 text-green-500" />}
                  </div>
                </TableCell>
                
                <TableCell>
                  <ToggleGroup type="multiple" variant="outline" >
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
                  <div className="mt-1 text-xs text-muted-foreground">
                    {scan.misconfigs > 0 && <span>{scan.misconfigs} misconfigs </span>}
                    {scan.secrets > 0 && <span>{scan.secrets} secrets</span>}
                  </div>
                </TableCell>
                
                <TableCell>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm">
                      {scan.newVulns > 0 && (
                        <Badge variant="destructive" className="text-xs">
                          +{scan.newVulns} new
                        </Badge>
                      )}
                      {scan.resolvedVulns > 0 && (
                        <Badge variant="default" className="text-xs">
                          -{scan.resolvedVulns} fixed
                        </Badge>
                      )}
                    </div>
                  </div>
                </TableCell>
                
                <TableCell>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground">Dockle:</span>
                      {getComplianceBadge(scan.compliance.dockle)}
                    </div>
                  </div>
                </TableCell>
                
                <TableCell>
                  <div className="flex items-center gap-2">
                    <IconClock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{scan.scanDuration}</span>
                  </div>
                </TableCell>
                
                <TableCell>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={(e) => handleDownload(scan.scanId, e)}
                  >
                    <IconDownload className="h-4 w-4" />
                  </Button>
                </TableCell>
                  </TableRow>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem 
                    onClick={() => {
                      // Delay to ensure context menu closes before modal opens
                      setTimeout(() => {
                        handleExport(scan)
                      }, 150)
                    }}
                    className="flex items-center"
                  >
                    <IconUpload className="mr-2 h-4 w-4" />
                    Export to Registry
                  </ContextMenuItem>
                  <ContextMenuItem 
                    className="text-red-600 focus:text-red-600 focus:bg-red-50"
                    onClick={() => {
                      // Delay to ensure context menu closes before modal opens
                      setTimeout(() => {
                        handleDeleteClick(scan.scanId)
                      }, 150)
                    }}
                  >
                    <IconTrash className="mr-2 h-4 w-4" />
                    Delete Scan
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            )
          })}
        </TableBody>
      </Table>
      
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Scan</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this scan? This action cannot be undone.
              All scan results and reports will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleDeleteCancel}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteConfirm}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {selectedScanForExport && (
        <ExportImageDialogEnhanced
          open={exportDialogOpen}
          onOpenChange={(open) => {
            setExportDialogOpen(open)
            if (!open) {
              setSelectedScanForExport(null)
            }
          }}
          imageName={selectedScanForExport.version.split(':')[0]}
          imageTag={selectedScanForExport.version.split(':')[1] || 'latest'}
          patchedTarPath=""
          patchOperationId=""
        />
      )}
    </div>
  )
}