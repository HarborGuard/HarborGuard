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
import { useScans } from "@/hooks/useScans"

interface LibrarySummary {
  name: string
  totalCves: number
  criticalCves: number
  highCves: number
  mediumCves: number
  lowCves: number
  affectedVersions: string[]
  affectedImages: Set<string>
  maxCvss: number
  hasFixableVulns: boolean
  latestVersion?: string
}

export default function LibraryHomePage() {
  const router = useRouter()
  const { scans, loading } = useScans()
  
  const [search, setSearch] = React.useState("")
  const [sortField, setSortField] = React.useState<string>("totalCves")
  const [sortOrder, setSortOrder] = React.useState<"asc" | "desc">("desc")

  const librariesData = React.useMemo(() => {
    if (!scans || scans.length === 0) return []

    const libraryMap = new Map<string, LibrarySummary>()
    
    // Track unique CVEs per library to avoid double counting
    const libraryCveMap = new Map<string, Set<string>>() // library -> Set of CVE IDs

    scans.forEach(scan => {
      const imageName = `${scan.imageName || scan.image.split(':')[0]}:${scan.image.split(':')[1] || 'latest'}`
      
      // Process Trivy results
      const trivyResults = scan.scannerReports?.trivy
      if (trivyResults?.Results) {
        trivyResults.Results.forEach(result => {
          result.Vulnerabilities?.forEach(vuln => {
            if (!vuln.PkgName || !vuln.VulnerabilityID) return

            const libraryName = vuln.PkgName
            const cveId = vuln.VulnerabilityID
            
            let library = libraryMap.get(libraryName)
            
            if (!library) {
              library = {
                name: libraryName,
                totalCves: 0,
                criticalCves: 0,
                highCves: 0,
                mediumCves: 0,
                lowCves: 0,
                affectedVersions: [],
                affectedImages: new Set(),
                maxCvss: 0,
                hasFixableVulns: false,
              }
              libraryMap.set(libraryName, library)
              libraryCveMap.set(libraryName, new Set())
            }

            // Only count each CVE once per library
            const libraryCves = libraryCveMap.get(libraryName)!
            if (!libraryCves.has(cveId)) {
              libraryCves.add(cveId)
              
              // Count unique vulnerabilities by severity
              library.totalCves += 1
              const severity = vuln.Severity?.toLowerCase()
              switch (severity) {
                case 'critical':
                  library.criticalCves += 1
                  break
                case 'high':
                  library.highCves += 1
                  break
                case 'medium':
                  library.mediumCves += 1
                  break
                case 'low':
                  library.lowCves += 1
                  break
              }
            }

            // Track affected versions (can have duplicates as different scans may have different versions)
            if (vuln.InstalledVersion && !library.affectedVersions.includes(vuln.InstalledVersion)) {
              library.affectedVersions.push(vuln.InstalledVersion)
            }

            // Track affected images (unique)
            library.affectedImages.add(imageName)

            // Track max CVSS score
            const cvssScore = vuln.CVSS?.nvd?.V3Score || vuln.CVSS?.redhat?.V3Score || 0
            if (cvssScore > library.maxCvss) {
              library.maxCvss = cvssScore
            }

            // Check if fixable
            if (vuln.FixedVersion) {
              library.hasFixableVulns = true
            }
          })
        })
        return // Skip Grype if we have Trivy data
      }

      // Process Grype results (fallback)
      const grypeResults = scan.scannerReports?.grype
      if (grypeResults?.matches) {
        grypeResults.matches.forEach(match => {
          const libraryName = match.artifact.name
          const cveId = match.vulnerability.id
          if (!libraryName || !cveId) return

          let library = libraryMap.get(libraryName)
          
          if (!library) {
            library = {
              name: libraryName,
              totalCves: 0,
              criticalCves: 0,
              highCves: 0,
              mediumCves: 0,
              lowCves: 0,
              affectedVersions: [],
              affectedImages: new Set(),
              maxCvss: 0,
              hasFixableVulns: false,
            }
            libraryMap.set(libraryName, library)
            libraryCveMap.set(libraryName, new Set())
          }

          // Only count each CVE once per library
          const libraryCves = libraryCveMap.get(libraryName)!
          if (!libraryCves.has(cveId)) {
            libraryCves.add(cveId)
            
            // Count unique vulnerabilities by severity
            library.totalCves += 1
            const severity = match.vulnerability.severity?.toLowerCase()
            switch (severity) {
              case 'critical':
                library.criticalCves += 1
                break
              case 'high':
                library.highCves += 1
                break
              case 'medium':
                library.mediumCves += 1
                break
              case 'low':
                library.lowCves += 1
                break
            }
          }

          // Track affected versions
          if (match.artifact.version && !library.affectedVersions.includes(match.artifact.version)) {
            library.affectedVersions.push(match.artifact.version)
          }

          // Track affected images (unique)
          library.affectedImages.add(imageName)

          // Track max CVSS score
          const cvssScore = match.vulnerability.cvss?.[0]?.metrics?.baseScore || 0
          if (cvssScore > library.maxCvss) {
            library.maxCvss = cvssScore
          }

          // Check if fixable
          if (match.vulnerability.fix?.versions?.[0]) {
            library.hasFixableVulns = true
          }
        })
      }
    })

    return Array.from(libraryMap.values())
      .filter(lib => lib.totalCves > 0) // Only show libraries with vulnerabilities
      .sort((a, b) => b.totalCves - a.totalCves) // Sort by total CVEs by default
  }, [scans])

  const filteredLibraries = React.useMemo(() => {
    let filtered = librariesData.filter(lib =>
      lib.name.toLowerCase().includes(search.toLowerCase())
    )

    return filtered.sort((a, b) => {
      let aValue: any, bValue: any

      switch (sortField) {
        case "totalCves":
          aValue = a.totalCves
          bValue = b.totalCves
          break
        case "criticalCves":
          aValue = a.criticalCves
          bValue = b.criticalCves
          break
        case "name":
          aValue = a.name
          bValue = b.name
          break
        case "maxCvss":
          aValue = a.maxCvss
          bValue = b.maxCvss
          break
        case "affectedImages":
          aValue = a.affectedImages.size
          bValue = b.affectedImages.size
          break
        case "affectedVersions":
          aValue = a.affectedVersions.length
          bValue = b.affectedVersions.length
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
  }, [librariesData, search, sortField, sortOrder])

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortOrder("desc")
    }
  }

  const handleRowClick = (libraryName: string) => {
    router.push(`/library/${encodeURIComponent(libraryName)}`)
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
    { label: "Library" }
  ]

  // Calculate overall statistics
  const stats = React.useMemo(() => {
    const totalLibraries = librariesData.length
    const totalCves = librariesData.reduce((sum, lib) => sum + lib.totalCves, 0)
    const criticalLibraries = librariesData.filter(lib => lib.criticalCves > 0).length
    const fixableLibraries = librariesData.filter(lib => lib.hasFixableVulns).length
    const highRiskLibraries = librariesData.filter(lib => lib.maxCvss >= 7.0).length

    return {
      totalLibraries,
      totalCves,
      criticalLibraries,
      fixableLibraries,
      highRiskLibraries,
      fixablePercent: totalLibraries > 0 ? Math.round((fixableLibraries / totalLibraries) * 100) : 0
    }
  }, [librariesData])

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Loading library data...</div>
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

              {/* Library Overview Stats */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <IconPackage className="h-5 w-5" />
                    Library Security Overview
                  </CardTitle>
                  <CardDescription>
                    Security analysis of all libraries across scanned images
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    <div className="text-center">
                      <p className="text-2xl font-bold">{stats.totalLibraries}</p>
                      <p className="text-sm text-muted-foreground">Vulnerable Libraries</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold">{stats.totalCves}</p>
                      <p className="text-sm text-muted-foreground">Total CVEs</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-red-600">{stats.criticalLibraries}</p>
                      <p className="text-sm text-muted-foreground">Critical Risk</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-orange-600">{stats.highRiskLibraries}</p>
                      <p className="text-sm text-muted-foreground">High CVSS (≥7.0)</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-green-600">{stats.fixableLibraries}</p>
                      <p className="text-sm text-muted-foreground">Have Fixes</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-blue-600">{stats.fixablePercent}%</p>
                      <p className="text-sm text-muted-foreground">Fixable Rate</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Libraries Table */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <IconBug className="h-5 w-5" />
                    Vulnerable Libraries
                  </CardTitle>
                  <CardDescription>
                    All libraries with security vulnerabilities found across scanned images
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* Search Bar */}
                    <div className="flex items-center gap-4">
                      <div className="relative flex-1">
                        <IconSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                        <Input
                          placeholder="Search libraries..."
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                          className="pl-10"
                        />
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {filteredLibraries.length} of {librariesData.length} libraries
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
                                onClick={() => handleSort("name")}
                              >
                                Library Name
                                {sortField === "name" && (
                                  sortOrder === "asc" ? <IconSortAscending className="ml-1 h-4 w-4" /> : <IconSortDescending className="ml-1 h-4 w-4" />
                                )}
                              </Button>
                            </TableHead>
                            <TableHead>
                              <Button
                                variant="ghost"
                                className="h-auto p-0 font-medium"
                                onClick={() => handleSort("totalCves")}
                              >
                                Total CVEs
                                {sortField === "totalCves" && (
                                  sortOrder === "asc" ? <IconSortAscending className="ml-1 h-4 w-4" /> : <IconSortDescending className="ml-1 h-4 w-4" />
                                )}
                              </Button>
                            </TableHead>
                            <TableHead>Severity Breakdown</TableHead>
                            <TableHead>
                              <Button
                                variant="ghost"
                                className="h-auto p-0 font-medium"
                                onClick={() => handleSort("maxCvss")}
                              >
                                Max CVSS
                                {sortField === "maxCvss" && (
                                  sortOrder === "asc" ? <IconSortAscending className="ml-1 h-4 w-4" /> : <IconSortDescending className="ml-1 h-4 w-4" />
                                )}
                              </Button>
                            </TableHead>
                            <TableHead>
                              <Button
                                variant="ghost"
                                className="h-auto p-0 font-medium"
                                onClick={() => handleSort("affectedVersions")}
                              >
                                Affected Versions
                                {sortField === "affectedVersions" && (
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
                                Found In
                                {sortField === "affectedImages" && (
                                  sortOrder === "asc" ? <IconSortAscending className="ml-1 h-4 w-4" /> : <IconSortDescending className="ml-1 h-4 w-4" />
                                )}
                              </Button>
                            </TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredLibraries.map((library) => (
                            <TableRow 
                              key={library.name}
                              className="cursor-pointer hover:bg-muted/50"
                              onClick={() => handleRowClick(library.name)}
                            >
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <IconPackage className="h-4 w-4 text-muted-foreground" />
                                  <span className="font-medium font-mono text-sm">{library.name}</span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant={library.totalCves > 10 ? "destructive" : library.totalCves > 5 ? "secondary" : "outline"}>
                                  {library.totalCves}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-1 flex-wrap">
                                  {library.criticalCves > 0 && (
                                    <Badge variant={getSeverityColor('critical')} className="text-xs">
                                      C: {library.criticalCves}
                                    </Badge>
                                  )}
                                  {library.highCves > 0 && (
                                    <Badge variant={getSeverityColor('high')} className="text-xs">
                                      H: {library.highCves}
                                    </Badge>
                                  )}
                                  {library.mediumCves > 0 && (
                                    <Badge variant={getSeverityColor('medium')} className="text-xs">
                                      M: {library.mediumCves}
                                    </Badge>
                                  )}
                                  {library.lowCves > 0 && (
                                    <Badge variant={getSeverityColor('low')} className="text-xs">
                                      L: {library.lowCves}
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge 
                                  variant={library.maxCvss >= 9.0 ? "destructive" : library.maxCvss >= 7.0 ? "secondary" : "outline"}
                                >
                                  {library.maxCvss > 0 ? library.maxCvss.toFixed(1) : "N/A"}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-1 flex-wrap max-w-xs">
                                  {library.affectedVersions.slice(0, 3).map((version, idx) => (
                                    <Badge key={`${library.name}-${version}-${idx}`} variant="outline" className="text-xs">
                                      {version}
                                    </Badge>
                                  ))}
                                  {library.affectedVersions.length > 3 && (
                                    <Badge variant="outline" className="text-xs">
                                      +{library.affectedVersions.length - 3} more
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs">
                                  {library.affectedImages.size} image{library.affectedImages.size !== 1 ? 's' : ''}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  {library.hasFixableVulns ? (
                                    <Badge variant="default" className="text-xs">
                                      <IconShield className="w-3 h-3 mr-1" />
                                      Fixable
                                    </Badge>
                                  ) : (
                                    <Badge variant="secondary" className="text-xs">
                                      <IconAlertTriangle className="w-3 h-3 mr-1" />
                                      No Fix
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    
                    {filteredLibraries.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        {search ? `No libraries found matching "${search}"` : "No vulnerable libraries found"}
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