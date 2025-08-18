"use client"

import { AppSidebar } from "@/components/app-sidebar"
import { VulnerabilityScatterplot } from "@/components/vulnerability-scatterplot"
import { DataTable } from "@/components/data-table"
import { SectionCards } from "@/components/section-cards"
import { SiteHeader } from "@/components/site-header"
import { ScanJobsMonitor } from "@/components/scan-jobs-monitor"
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { useScans } from "@/hooks/useScans"

export default function Page() {
  const { scans, stats, loading, error } = useScans()

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>
  }

  if (error) {
    return <div className="flex items-center justify-center h-screen text-red-500">Error: {error}</div>
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
      <SidebarInset className="flex flex-col">
        <SiteHeader />
        <div className="flex-1 overflow-auto">
          <div className="@container/main flex flex-col gap-2 p-4 lg:p-6">
            <SectionCards scanData={scans} stats={stats} />
            <ScanJobsMonitor />
            <VulnerabilityScatterplot />
            <DataTable data={scans} />
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
