"use client"

import { useParams } from "next/navigation"
import { useEffect, useState } from "react"
import {
  IconCalendarClock,
  IconDownload,
  IconShield,
  IconTag,
  IconCpu,
  IconClock,
  IconUser,
  IconTerminal,
  IconFolder,
  IconSettings,
} from "@tabler/icons-react"

import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Separator } from "@/components/ui/separator"
import { HistoricalScansTable } from "@/components/historical-scans-table"

export default function ImageDetailsPage() {
  const params = useParams()
  const rawImageName = params.name as string
  const imageName = decodeURIComponent(rawImageName) // Decode the URL-encoded name
  const [imageData, setImageData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchImageData() {
      try {
        // Fetch with a higher scan limit to show more historical data
        const response = await fetch(`/api/images/name/${encodeURIComponent(imageName)}?scanLimit=50`)
        if (!response.ok) {
          if (response.status === 404) {
            setError('No images found with this name')
          } else {
            setError('Failed to load image data')
          }
          return
        }
        const data = await response.json()
        setImageData(data)
      } catch (err) {
        setError('Failed to load image data')
        console.error('Error fetching image data:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchImageData()
  }, [imageName])

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>
  }
  
  if (error || !imageData) {
    const breadcrumbs = [
      { label: "Dashboard", href: "/" },
      { label: imageName }
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
        <SidebarInset className="flex flex-col">
          <SiteHeader breadcrumbs={breadcrumbs} />
          <div className="flex-1 overflow-auto">
            <div className="@container/main flex flex-col gap-4 p-4 lg:p-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-red-500">
                    <IconShield className="h-5 w-5" />
                    Image Not Found
                  </CardTitle>
                  <CardDescription>
                    {error || 'The requested image could not be found'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col items-center gap-4 py-8">
                  <p className="text-muted-foreground text-center">
                    The image "{imageName}" does not exist or may have been removed.
                  </p>
                  <Button asChild>
                    <a href="/">
                      Go Back to Dashboard
                    </a>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    )
  }

  // Transform scans to historical scans format (now includes all tags)
  const historicalScans = imageData.scans?.map((scan: any, index: number) => {
    return {
      id: Math.abs(scan.id.split('').reduce((a: number, b: string) => ((a << 5) - a + b.charCodeAt(0)) | 0, 0)),
      scanId: scan.id, // Real scan ID for navigation
      scanDate: scan.startedAt,
      version: `${scan.image.name}:${scan.image.tag}`, // Show specific tag for each scan
      riskScore: scan.riskScore || 0,
      severities: scan.vulnerabilityCount ? {
        crit: scan.vulnerabilityCount.critical || 0,
        high: scan.vulnerabilityCount.high || 0,
        med: scan.vulnerabilityCount.medium || 0,
        low: scan.vulnerabilityCount.low || 0,
      } : { crit: 0, high: 0, med: 0, low: 0 },
      fixable: {
        count: 0, // TODO: Calculate from scan data
        percent: 0
      },
      status: scan.status === 'SUCCESS' ? 'Complete' : scan.status,
      scanDuration: scan.finishedAt ? 
        `${Math.round((new Date(scan.finishedAt).getTime() - new Date(scan.startedAt).getTime()) / 1000)}s` : 
        'Running',
      newVulns: 0, // TODO: Calculate delta
      resolvedVulns: 0,
      misconfigs: 0, // TODO: Extract from dockle data
      secrets: 0, // TODO: Extract from trivy data
      compliance: {
        dockle: scan.complianceScore?.dockle?.grade || 'N/A',
      },
      dbVersion: '1.0', // TODO: Get from scan metadata
      scanEngine: 'Multi-tool' // TODO: Get from scannerVersions
    }
  }) || []

  const breadcrumbs = [
    { label: "Dashboard", href: "/" },
    { label: imageData.name }
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
      <SidebarInset className="flex flex-col">
        <SiteHeader breadcrumbs={breadcrumbs} />
        <div className="flex-1 overflow-auto">
          <div className="@container/main flex flex-col gap-4 p-4 lg:p-6">
              

              {/* Image Metadata Cards */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Basic Information */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <IconTag className="h-5 w-5" />
                      Image Information
                    </CardTitle>
                    <CardDescription>
                      Container image details and metadata
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Image Name</p>
                        <p className="font-mono text-sm">{imageData.name}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Available Tags</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {imageData.tags?.map((tag: string) => (
                            <Badge key={tag} variant="outline" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Latest Tag</p>
                        <Badge variant="outline">{imageData.latestImage?.tag}</Badge>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Platform</p>
                        <Badge variant="outline">{imageData.latestImage?.platform || 'Unknown'}</Badge>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Size (Latest)</p>
                        <p className="text-sm">
                          {imageData.latestImage?.sizeBytes ? 
                            Math.round(parseInt(imageData.latestImage.sizeBytes) / 1024 / 1024) : 0} MB
                        </p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Registry</p>
                        <p className="text-sm">
                          {imageData.registries?.length > 0 ? imageData.registries.join(", ") : "Docker Hub"}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Total Scans</p>
                        <p className="text-sm">{imageData.totalScans}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">Latest Digest</p>
                        <p className="font-mono text-sm text-xs">
                          {imageData.latestImage?.digest?.slice(7, 19) || 'N/A'}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Summary Statistics */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <IconShield className="h-5 w-5" />
                      Security Summary
                    </CardTitle>
                    <CardDescription>
                      Across all tags and scans
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {historicalScans.length > 0 ? (
                      <div className="space-y-3">
                        <div className="flex justify-between">
                          <span className="text-sm">Latest Risk Score</span>
                          <Badge variant={
                            historicalScans[0]?.riskScore > 75 ? "destructive" : 
                            historicalScans[0]?.riskScore > 50 ? "default" : "secondary"
                          }>
                            {historicalScans[0]?.riskScore}/100
                          </Badge>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm">Critical Vulns</span>
                          <span className="text-sm font-medium text-red-600">
                            {historicalScans[0]?.severities?.crit || 0}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm">High Vulns</span>
                          <span className="text-sm font-medium text-orange-600">
                            {historicalScans[0]?.severities?.high || 0}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No scan data available</p>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Historical Scans */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <IconCalendarClock className="h-5 w-5" />
                    All Scans Across Tags
                  </CardTitle>
                  <CardDescription>
                    Security scans for all versions of {imageData.name}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <HistoricalScansTable data={historicalScans} imageId={imageData.name} />
                </CardContent>
              </Card>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}