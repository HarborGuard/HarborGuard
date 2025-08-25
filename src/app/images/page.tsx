"use client"

import { AppSidebar } from "@/components/app-sidebar"
import { DataTable } from "@/components/data-table"
import { SiteHeader } from "@/components/site-header"
import { ScanJobsMonitor } from "@/components/scan-jobs-monitor"
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { useScans } from "@/hooks/useScans"
import { FullPageLoading } from "@/components/ui/loading"

export default function ImageRepositoryPage() {
  const { scans, loading } = useScans()
  const breadcrumbs = [
    { label: "Dashboard", href: "/" },
    { label: "Images" }
  ]

  if (loading) {
    return (
      <FullPageLoading 
        message="Loading Image Repository" 
        description="Fetching container images and scan results..."
      />
    )
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" />
      <SidebarInset className="flex flex-col flex-grow">
        <SiteHeader breadcrumbs={breadcrumbs} />
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2 overflow-auto">
            <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
              <ScanJobsMonitor />
              <DataTable data={scans} isFullPage={true} />
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}