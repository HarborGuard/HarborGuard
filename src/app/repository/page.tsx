"use client"

import { AppSidebar } from "@/components/app-sidebar"
import { DataTable } from "@/components/data-table"
import { SiteHeader } from "@/components/site-header"
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { useScans } from "@/hooks/useScans"

export default function ImageRepositoryPage() {
  const { scans, loading } = useScans()
  const breadcrumbs = [
    { label: "Dashboard", href: "/" },
    { label: "Image Repository" }
  ]

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>
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
              <DataTable data={scans} isFullPage={true} />
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}