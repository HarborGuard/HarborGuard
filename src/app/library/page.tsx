"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  IconPackage,
  IconBug,
  IconShield,
  IconSearch,
  IconSortAscending,
  IconSortDescending,
  IconAlertTriangle,
  IconExternalLink,
  IconX,
  IconCheck,
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
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface VulnerabilityData {
  cveId: string
  severity: string
  description?: string
  cvssScore?: number
  packageName?: string
  affectedImages: Array<{
    imageName: string
    imageId: string
    isFalsePositive: boolean
  }>
  totalAffectedImages: number
  falsePositiveImages: string[]
  fixedVersion?: string
  publishedDate?: string
  references?: string[]
}

export default function LibraryHomePage() {
  const router = useRouter()
  
  const [vulnerabilities, setVulnerabilities] = React.useState<VulnerabilityData[]>([])
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState("")
  const [severityFilter, setSeverityFilter] = React.useState<string>("")
  const [sortField, setSortField] = React.useState<string>("severity")
  const [sortOrder, setSortOrder] = React.useState<"asc" | "desc">("desc")
  const [pagination, setPagination] = React.useState({
    total: 0,
    limit: 100,
    offset: 0,
    hasMore: false
  })

  // Fetch vulnerabilities from API
  const fetchVulnerabilities = React.useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        limit: pagination.limit.toString(),
        offset: pagination.offset.toString(),
      })
      
      if (search) params.append('search', search)
      if (severityFilter) params.append('severity', severityFilter)
      
      const response = await fetch(`/api/vulnerabilities?${params}`)
      if (!response.ok) throw new Error('Failed to fetch vulnerabilities')
      
      const data = await response.json()
      setVulnerabilities(data.vulnerabilities)
      setPagination(data.pagination)
    } catch (error) {
      console.error('Failed to fetch vulnerabilities:', error)
    } finally {
      setLoading(false)
    }
  }, [search, severityFilter, pagination.limit, pagination.offset])
  
  React.useEffect(() => {
    fetchVulnerabilities()
  }, [fetchVulnerabilities])

  const sortedVulnerabilities = React.useMemo(() => {
    return [...vulnerabilities].sort((a, b) => {
      let aValue: any, bValue: any

      switch (sortField) {
        case "cveId":
          aValue = a.cveId
          bValue = b.cveId
          break
        case "severity":
          const severityPriority = { critical: 5, high: 4, medium: 3, low: 2, info: 1, unknown: 0 }
          aValue = severityPriority[a.severity as keyof typeof severityPriority] || 0
          bValue = severityPriority[b.severity as keyof typeof severityPriority] || 0
          break
        case "cvssScore":
          aValue = a.cvssScore || 0
          bValue = b.cvssScore || 0
          break
        case "affectedImages":
          aValue = a.totalAffectedImages
          bValue = b.totalAffectedImages
          break
        case "falsePositives":
          aValue = a.falsePositiveImages.length
          bValue = b.falsePositiveImages.length
          break
        case "packageName":
          aValue = a.packageName || ''
          bValue = b.packageName || ''
          break
        default:
          return 0
      }

      if (sortOrder === "asc") {
        return aValue > bValue ? 1 : -1
      } else {
        return aValue < bValue ? 1 : -1
      }
    })
  }, [vulnerabilities, sortField, sortOrder])

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortOrder("desc")
    }
  }

  const handleRowClick = (cveId: string) => {
    // Could navigate to a CVE detail page in the future
    window.open(`https://nvd.nist.gov/vuln/detail/${cveId}`, '_blank')
  }

  const getSeverityColor = (severity: 'critical' | 'high' | 'medium' | 'low') => {
    switch (severity) {
      case "critical":
        return "destructive"
      case "high":
        return "destructive"
      case "medium":
        return "secondary"
      case "low":
        return "outline"
      default:
        return "outline"
    }
  }

  const breadcrumbs = [
    { label: "Dashboard", href: "/" },
    { label: "Vulnerability Library" }
  ]

  // Calculate overall statistics
  const stats = React.useMemo(() => {
    const totalCves = vulnerabilities.length
    const criticalCves = vulnerabilities.filter(v => v.severity === 'critical').length
    const highCves = vulnerabilities.filter(v => v.severity === 'high').length
    const fixableCves = vulnerabilities.filter(v => v.fixedVersion).length
    const totalFalsePositives = vulnerabilities.reduce((sum, v) => sum + v.falsePositiveImages.length, 0)
    const cvesWithFalsePositives = vulnerabilities.filter(v => v.falsePositiveImages.length > 0).length
    const highRiskCves = vulnerabilities.filter(v => (v.cvssScore || 0) >= 7.0).length

    return {
      totalCves,
      criticalCves,
      highCves,
      fixableCves,
      totalFalsePositives,
      cvesWithFalsePositives,
      highRiskCves,
      fixablePercent: totalCves > 0 ? Math.round((fixableCves / totalCves) * 100) : 0
    }
  }, [vulnerabilities])

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Loading vulnerabilities...</div>
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
            <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">

              {/* Vulnerability Overview Stats */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <IconBug className="h-5 w-5" />
                    Vulnerability Library Overview
                  </CardTitle>
                  <CardDescription>
                    All vulnerabilities across scanned images with false positive tracking
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                    <div className="text-center">
                      <p className="text-2xl font-bold">{stats.totalCves}</p>
                      <p className="text-sm text-muted-foreground">Total CVEs</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-red-600">{stats.criticalCves}</p>
                      <p className="text-sm text-muted-foreground">Critical</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-orange-600">{stats.highCves}</p>
                      <p className="text-sm text-muted-foreground">High</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-orange-600">{stats.highRiskCves}</p>
                      <p className="text-sm text-muted-foreground">High CVSS (≥7.0)</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-green-600">{stats.fixableCves}</p>
                      <p className="text-sm text-muted-foreground">Fixable</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-purple-600">{stats.cvesWithFalsePositives}</p>
                      <p className="text-sm text-muted-foreground">With False Positives</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-blue-600">{stats.fixablePercent}%</p>
                      <p className="text-sm text-muted-foreground">Fixable Rate</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Vulnerabilities Table */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <IconBug className="h-5 w-5" />
                    Vulnerability Library
                  </CardTitle>
                  <CardDescription>
                    All vulnerabilities found across scanned images with false positive tracking
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* Search and Filters */}
                    <div className="flex items-center gap-4">
                      <div className="relative flex-1">
                        <IconSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                        <Input
                          placeholder="Search CVEs or descriptions..."
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          className="pl-10"
                        />
                      </div>
                      <Select value={severityFilter || "all"} onValueChange={(value) => setSeverityFilter(value === "all" ? "" : value)}>
                        <SelectTrigger className="w-32">
                          <SelectValue placeholder="Severity" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All</SelectItem>
                          <SelectItem value="critical">Critical</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="low">Low</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="text-sm text-muted-foreground">
                        {vulnerabilities.length} vulnerabilities
                      </div>
                    </div>

                    {/* Table */}
                    <div className="border rounded-lg">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>
                              <Button
                                variant="ghost"
                                className="h-auto p-0 font-medium"
                                onClick={() => handleSort("cveId")}
                              >
                                CVE ID
                                {sortField === "cveId" && (
                                  sortOrder === "asc" ? <IconSortAscending className="ml-1 h-4 w-4" /> : <IconSortDescending className="ml-1 h-4 w-4" />
                                )}
                              </Button>
                            </TableHead>
                            <TableHead>
                              <Button
                                variant="ghost"
                                className="h-auto p-0 font-medium"
                                onClick={() => handleSort("severity")}
                              >
                                Severity
                                {sortField === "severity" && (
                                  sortOrder === "asc" ? <IconSortAscending className="ml-1 h-4 w-4" /> : <IconSortDescending className="ml-1 h-4 w-4" />
                                )}
                              </Button>
                            </TableHead>
                            <TableHead>
                              <Button
                                variant="ghost"
                                className="h-auto p-0 font-medium"
                                onClick={() => handleSort("cvssScore")}
                              >
                                CVSS Score
                                {sortField === "cvssScore" && (
                                  sortOrder === "asc" ? <IconSortAscending className="ml-1 h-4 w-4" /> : <IconSortDescending className="ml-1 h-4 w-4" />
                                )}
                              </Button>
                            </TableHead>
                            <TableHead>
                              <Button
                                variant="ghost"
                                className="h-auto p-0 font-medium"
                                onClick={() => handleSort("packageName")}
                              >
                                Package
                                {sortField === "packageName" && (
                                  sortOrder === "asc" ? <IconSortAscending className="ml-1 h-4 w-4" /> : <IconSortDescending className="ml-1 h-4 w-4" />
                                )}
                              </Button>
                            </TableHead>
                            <TableHead>
                              <Button
                                variant="ghost"
                                className="h-auto p-0 font-medium"
                                onClick={() => handleSort("affectedImages")}
                              >
                                Affected Images
                                {sortField === "affectedImages" && (
                                  sortOrder === "asc" ? <IconSortAscending className="ml-1 h-4 w-4" /> : <IconSortDescending className="ml-1 h-4 w-4" />
                                )}
                              </Button>
                            </TableHead>
                            <TableHead>
                              <Button
                                variant="ghost"
                                className="h-auto p-0 font-medium"
                                onClick={() => handleSort("falsePositives")}
                              >
                                False Positives
                                {sortField === "falsePositives" && (
                                  sortOrder === "asc" ? <IconSortAscending className="ml-1 h-4 w-4" /> : <IconSortDescending className="ml-1 h-4 w-4" />
                                )}
                              </Button>
                            </TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sortedVulnerabilities.map((vuln) => (
                            <TableRow 
                              key={vuln.cveId}
                              className="hover:bg-muted/50"
                            >
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <IconBug className="h-4 w-4 text-muted-foreground" />
                                  <span className="font-medium font-mono text-sm">{vuln.cveId}</span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant={getSeverityColor(vuln.severity as 'critical' | 'high' | 'medium' | 'low')}>
                                  {vuln.severity.charAt(0).toUpperCase() + vuln.severity.slice(1)}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge 
                                  variant={!vuln.cvssScore ? "outline" : vuln.cvssScore >= 9.0 ? "destructive" : vuln.cvssScore >= 7.0 ? "secondary" : "outline"}
                                >
                                  {vuln.cvssScore ? vuln.cvssScore.toFixed(1) : "N/A"}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <span className="font-mono text-sm">{vuln.packageName || 'N/A'}</span>
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-1 flex-wrap max-w-xs">
                                  {vuln.affectedImages.slice(0, 3).map((image, idx) => (
                                    <Badge 
                                      key={`${vuln.cveId}-${image.imageName}-${idx}`} 
                                      variant={image.isFalsePositive ? "secondary" : "outline"}
                                      className="text-xs"
                                    >
                                      {image.isFalsePositive && <IconX className="w-3 h-3 mr-1" />}
                                      {image.imageName}
                                    </Badge>
                                  ))}
                                  {vuln.affectedImages.length > 3 && (
                                    <Badge variant="outline" className="text-xs">
                                      +{vuln.affectedImages.length - 3} more
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                {vuln.falsePositiveImages.length > 0 ? (
                                  <div className="flex gap-1 flex-wrap max-w-xs">
                                    {vuln.falsePositiveImages.slice(0, 2).map((imageName, idx) => (
                                      <Badge key={`fp-${vuln.cveId}-${imageName}-${idx}`} variant="secondary" className="text-xs">
                                        <IconX className="w-3 h-3 mr-1" />
                                        {imageName}
                                      </Badge>
                                    ))}
                                    {vuln.falsePositiveImages.length > 2 && (
                                      <Badge variant="secondary" className="text-xs">
                                        +{vuln.falsePositiveImages.length - 2} more
                                      </Badge>
                                    )}
                                  </div>
                                ) : (
                                  <Badge variant="outline" className="text-xs">
                                    <IconCheck className="w-3 h-3 mr-1" />
                                    None
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="max-w-xs">
                                  <p className="text-sm text-muted-foreground truncate" title={vuln.description}>
                                    {vuln.description || 'No description available'}
                                  </p>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleRowClick(vuln.cveId)}
                                    className="text-xs"
                                  >
                                    <IconExternalLink className="w-3 h-3 mr-1" />
                                    View
                                  </Button>
                                  {vuln.fixedVersion && (
                                    <Badge variant="default" className="text-xs">
                                      <IconShield className="w-3 h-3 mr-1" />
                                      Fix: {vuln.fixedVersion}
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    
                    {vulnerabilities.length === 0 && !loading && (
                      <div className="text-center py-8 text-muted-foreground">
                        {search || severityFilter ? `No vulnerabilities found matching current filters` : "No vulnerabilities found"}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}