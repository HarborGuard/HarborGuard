"use client"

import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { CheckCircle2, Loader } from "lucide-react"
import { CellRendererProps } from "../types"
import { useScanning } from "@/contexts/ScanningContext"

interface StatusCellData {
  imageName?: string
  imageId?: string
  status: string
}

export function statusCell<T>({ value, row, column }: CellRendererProps<T>) {
  const { runningJobs } = useScanning()

  // Extract data from row
  const data = row.original as any
  const imageId = column.cellProps?.imageIdField ? data[column.cellProps.imageIdField] : data.imageId
  const imageName = column.cellProps?.imageNameField ? data[column.cellProps.imageNameField] : data.imageName

  // Check if there's a running scan for this image
  const runningJob = runningJobs.find(job => {
    if (imageId && imageId === job.imageId) {
      return true
    }
    return false
  })

  // If there's a running scan, show progress bar
  if (runningJob) {
    return (
      <div className="w-32 space-y-1">
        <div className="flex items-center justify-between text-caption uppercase tracking-widest">
          <span className="text-muted-foreground/60">Scanning</span>
          <span className="font-mono">{runningJob.progress}%</span>
        </div>
        <Progress
          value={runningJob.progress}
          className="h-2"
        />
        {runningJob.step && (
          <div className="text-caption uppercase tracking-widest text-muted-foreground/60 truncate">
            {runningJob.step}
          </div>
        )}
      </div>
    )
  }

  // Otherwise show the regular status badge
  return (
    <Badge variant="outline" className="rounded-none uppercase tracking-widest text-caption border-white/10 text-muted-foreground">
      {value === "Complete" ? (
        <CheckCircle2 className="fill-green-500 dark:fill-green-400" />
      ) : (
        <Loader />
      )}
      {value}
    </Badge>
  )
}
