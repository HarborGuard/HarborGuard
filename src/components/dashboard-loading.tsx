"use client"

import * as React from "react"
import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import { Progress } from "@/components/ui/progress"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { 
  IconShield, 
  IconAlertTriangle, 
  IconBug, 
  IconClock,
  IconEye,
  IconTrendingUp 
} from "@tabler/icons-react"

export function DashboardLoading() {
  const [progress, setProgress] = React.useState(10)
  const [statusText, setStatusText] = React.useState("Initializing...")

  React.useEffect(() => {
    const statusMessages = [
      "Initializing...",
      "Loading scan data...", 
      "Aggregating vulnerabilities...",
      "Processing security metrics...",
      "Finalizing dashboard..."
    ]
    
    let statusIndex = 0
    let messageTimer = setInterval(() => {
      setStatusText(statusMessages[statusIndex])
      statusIndex = (statusIndex + 1) % statusMessages.length
    }, 800)

    const progressTimer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) return 90 // Never complete, just indicate ongoing loading
        return prev + Math.random() * 15
      })
    }, 200)

    return () => {
      clearInterval(progressTimer)
      clearInterval(messageTimer)
    }
  }, [])

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
        {/* Loading Progress Bar */}
        <div className="sticky top-0 z-50 bg-background border-b">
          <Progress 
            value={progress} 
            className="h-1 rounded-none"
            indicatorClassName="bg-gradient-to-r from-blue-500 to-purple-500"
          />
        </div>
        <SiteHeader />
        <div className="flex-1 overflow-auto">
          <div className="@container/main flex flex-col gap-2 p-4 lg:p-6">
            {/* Loading Status */}
            <div className="flex items-center justify-center py-4">
              <div className="flex items-center gap-3">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
                <span className="text-muted-foreground font-medium">{statusText}</span>
              </div>
            </div>
            
            {/* Section Cards Skeleton */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
              {/* Total Scans Card */}
              <Card className="@container/card">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Total Scans
                  </CardTitle>
                  <IconEye className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-16 mb-2" />
                  <Skeleton className="h-3 w-24" />
                </CardContent>
              </Card>

              {/* Critical Vulnerabilities Card */}
              <Card className="@container/card">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Critical
                  </CardTitle>
                  <IconShield className="h-4 w-4 text-red-500" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-12 mb-2" />
                  <Skeleton className="h-3 w-20" />
                </CardContent>
              </Card>

              {/* High Vulnerabilities Card */}
              <Card className="@container/card">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    High
                  </CardTitle>
                  <IconAlertTriangle className="h-4 w-4 text-orange-500" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-12 mb-2" />
                  <Skeleton className="h-3 w-20" />
                </CardContent>
              </Card>

              {/* Medium Vulnerabilities Card */}
              <Card className="@container/card">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Medium
                  </CardTitle>
                  <IconBug className="h-4 w-4 text-yellow-500" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-12 mb-2" />
                  <Skeleton className="h-3 w-20" />
                </CardContent>
              </Card>

              {/* Low Vulnerabilities Card */}
              <Card className="@container/card">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Low
                  </CardTitle>
                  <IconBug className="h-4 w-4 text-blue-500" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-12 mb-2" />
                  <Skeleton className="h-3 w-20" />
                </CardContent>
              </Card>

              {/* Average Risk Score Card */}
              <Card className="@container/card">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Avg Risk Score
                  </CardTitle>
                  <IconTrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-16 mb-2" />
                  <Skeleton className="h-3 w-20" />
                </CardContent>
              </Card>
            </div>

            {/* Scan Jobs Monitor Skeleton */}
            <Card className="mb-4">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <IconClock className="h-5 w-5" />
                  <CardTitle>Scan Jobs</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              </CardContent>
            </Card>

            {/* Vulnerability Scatterplot Skeleton */}
            <div className="gap-4 px-4 my-4 lg:px-6">
              <Card className="@container/card">
                <CardHeader>
                  <CardTitle>Image Vulnerability Analysis</CardTitle>
                  <div className="text-sm text-muted-foreground">
                    <Skeleton className="h-4 w-64" />
                  </div>
                </CardHeader>
                <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
                  {/* Toggle buttons skeleton */}
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex-grow"/>
                    <div className="flex gap-2">
                      <Skeleton className="h-8 w-12" />
                      <Skeleton className="h-8 w-12" />
                      <Skeleton className="h-8 w-12" />
                      <Skeleton className="h-8 w-12" />
                    </div>
                  </div>
                  {/* Chart skeleton */}
                  <div className="aspect-auto h-[250px] w-full flex items-center justify-center bg-muted/20 rounded-md">
                    <Skeleton className="h-full w-full" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Data Table Skeleton */}
            <Card>
              <CardHeader>
                <CardTitle>Scan Results</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {/* Table header skeleton */}
                  <div className="grid grid-cols-8 gap-4 pb-3 border-b">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                  
                  {/* Table rows skeleton */}
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="grid grid-cols-8 gap-4 py-3 items-center">
                      <div className="space-y-1">
                        <Skeleton className="h-4 w-16" />
                        <Skeleton className="h-3 w-12" />
                      </div>
                      <div className="space-y-1">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-3 w-16" />
                      </div>
                      <Skeleton className="h-6 w-12" />
                      <div className="flex gap-1">
                        <Skeleton className="h-5 w-8" />
                        <Skeleton className="h-5 w-8" />
                        <Skeleton className="h-5 w-8" />
                      </div>
                      <Skeleton className="h-4 w-8" />
                      <Skeleton className="h-4 w-12" />
                      <div className="space-y-1">
                        <Skeleton className="h-4 w-16" />
                        <Skeleton className="h-3 w-12" />
                      </div>
                      <Skeleton className="h-6 w-16" />
                    </div>
                  ))}
                </div>
                
                {/* Pagination skeleton */}
                <div className="flex items-center justify-between pt-4 border-t">
                  <Skeleton className="h-4 w-32" />
                  <div className="flex gap-2">
                    <Skeleton className="h-8 w-20" />
                    <Skeleton className="h-8 w-8" />
                    <Skeleton className="h-8 w-8" />
                    <Skeleton className="h-8 w-20" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}