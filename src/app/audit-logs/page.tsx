"use client"

import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { AuditLogTable } from "@/components/audit-log-table"
import { AuditLogFilters } from "@/components/audit-log-filters"
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useState } from "react"

export interface AuditLogFiltersState {
  eventType?: string
  category?: string
  userIp?: string
  resource?: string
  search?: string
  startDate?: string
  endDate?: string
}

export default function AuditLogsPage() {
  const [filters, setFilters] = useState<AuditLogFiltersState>({})
  
  const breadcrumbs = [
    { label: "Dashboard", href: "/" },
    { label: "Audit Logs" }
  ]

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
          <div className="@container/main flex flex-1 flex-col gap-4 overflow-auto p-4 lg:p-6">
            <div className="flex flex-col gap-4">
              <div>
                <h1 className="text-2xl font-bold">Audit Logs</h1>
                <p className="text-muted-foreground">
                  Track all user actions and system events for security and compliance monitoring
                </p>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Filter Audit Logs</CardTitle>
                  <CardDescription>
                    Filter audit logs by event type, category, user, or time range
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <AuditLogFilters 
                    filters={filters}
                    onFiltersChange={setFilters}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Audit Events</CardTitle>
                  <CardDescription>
                    Complete log of all system activities and user actions
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <AuditLogTable filters={filters} />
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}