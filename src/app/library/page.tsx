"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Bug,
  Search,
  ExternalLink,
} from "lucide-react";
import { VulnerabilityDetailsModal } from "@/components/dialogs/vulnerability-details-modal";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { UnifiedTable } from "@/components/table/unified-table";
import { ColumnDefinition, RowAction } from "@/components/table/types";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  StatsLoadingSkeleton,
  TableLoadingSkeleton,
} from "@/components/ui/loading";
import { getSeverityBadgeVariant } from "@/lib/utils/severity-utils";
import { getImageName } from "@/lib/utils/image-utils";
import { useVulnerabilityLibrary, VulnerabilityData } from "@/hooks/useVulnerabilityLibrary";

export default function LibraryHomePage() {
  const router = useRouter();

  const {
    vulnerabilities,
    loading,
    stats,
    page,
    pageSize,
    totalPages,
    pagination,
    setPage,
    sortField,
    sortOrder,
    handleSort,
    search,
    setSearch,
    severityFilter,
    setSeverityFilter,
  } = useVulnerabilityLibrary();

  // Modal state
  const [selectedVulnerability, setSelectedVulnerability] = React.useState<VulnerabilityData | null>(null);
  const [isModalOpen, setIsModalOpen] = React.useState(false);

  const breadcrumbs = [
    { label: "Dashboard", href: "/" },
    { label: "Vulnerability Library" },
  ];

  // Handle vulnerability click
  const handleVulnerabilityClick = (vuln: VulnerabilityData) => {
    setSelectedVulnerability(vuln);
    setIsModalOpen(true);
  };

  if (loading) {
    return (
      <div className="flex flex-1 flex-col">
        <div className="@container/main flex flex-1 flex-col gap-2 overflow-auto">
          <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
            {/* Stats skeleton */}
            <StatsLoadingSkeleton />

            {/* Table skeleton */}
            <Card className="bg-surface-1 border-white/10 rounded-none">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-body-sm uppercase tracking-caps text-muted-foreground/60">
                  <div className="animate-pulse">
                    <Bug className="h-4 w-4" />
                  </div>
                  Loading Vulnerability Library
                </CardTitle>
                <CardDescription className="text-caption uppercase tracking-widest text-muted-foreground/40">
                  Loading all vulnerabilities found across scanned images...
                </CardDescription>
              </CardHeader>
              <CardContent>
                <TableLoadingSkeleton columns={8} rows={10} />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-2 overflow-auto">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
          {/* Vulnerability Overview Stats */}
          <Card className="bg-surface-1 border-white/10 rounded-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-body-sm uppercase tracking-caps text-foreground">
                <Bug className="h-4 w-4 text-accent" />
                Vulnerability Library Overview
              </CardTitle>
              <CardDescription className="text-caption uppercase tracking-widest text-muted-foreground/50">
                All vulnerabilities across scanned images with false positive
                tracking
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                <div className="text-center">
                  <p className="text-2xl tracking-tight text-foreground">{stats.totalCves}</p>
                  <p className="text-caption uppercase tracking-widest text-muted-foreground/50">Total CVEs</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl tracking-tight text-red-400">
                    {stats.criticalCves}
                  </p>
                  <p className="text-caption uppercase tracking-widest text-muted-foreground/50">Critical</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl tracking-tight text-orange-400">
                    {stats.highCves}
                  </p>
                  <p className="text-caption uppercase tracking-widest text-muted-foreground/50">High</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl tracking-tight text-orange-400">
                    {stats.highRiskCves}
                  </p>
                  <p className="text-caption uppercase tracking-widest text-muted-foreground/50">
                    High CVSS (≥7.0)
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-2xl tracking-tight text-green-400">
                    {stats.fixableCves}
                  </p>
                  <p className="text-caption uppercase tracking-widest text-muted-foreground/50">Fixable</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl tracking-tight text-purple-400">
                    {stats.cvesWithFalsePositives}
                  </p>
                  <p className="text-caption uppercase tracking-widest text-muted-foreground/50">
                    With False Positives
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-2xl tracking-tight text-blue-400">
                    {stats.fixablePercent}%
                  </p>
                  <p className="text-caption uppercase tracking-widest text-muted-foreground/50">Fixable Rate</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Vulnerabilities Table */}
          <Card className="bg-surface-1 border-white/10 rounded-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-body-sm uppercase tracking-caps text-foreground">
                <Bug className="h-4 w-4 text-accent" />
                Vulnerability Library
              </CardTitle>
              <CardDescription className="text-caption uppercase tracking-widest text-muted-foreground/50">
                All vulnerabilities found across scanned images with false
                positive tracking
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Search and Filters */}
                <div className="flex items-center gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground/40 h-4 w-4" />
                    <Input
                      placeholder="Search CVEs or descriptions..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-10 rounded-none border-white/10 bg-transparent text-body-sm placeholder:text-muted-foreground/30 placeholder:tracking-caps placeholder:uppercase"
                    />
                  </div>
                  <Select
                    value={severityFilter || "all"}
                    onValueChange={(value) =>
                      setSeverityFilter(value === "all" ? "" : value)
                    }
                  >
                    <SelectTrigger className="w-32 rounded-none border-white/10 text-caption uppercase tracking-widest">
                      <SelectValue placeholder="Severity" />
                    </SelectTrigger>
                    <SelectContent className="bg-overlay border-white/10 rounded-none">
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="text-caption uppercase tracking-widest text-muted-foreground/50">
                    {pagination.total !== undefined
                      ? `${pagination.total} total vulnerabilities`
                      : `${vulnerabilities.length} vulnerabilities`}
                  </div>
                </div>

                {/* Table */}
                <UnifiedTable
                  data={vulnerabilities}
                  columns={getLibraryTableColumns()}
                  features={{
                    sorting: false,
                    filtering: false,
                    pagination: true,
                    search: false,
                    columnVisibility: true,
                  }}
                  serverPagination={{
                    currentPage: page,
                    totalPages: totalPages,
                    pageSize: pageSize,
                    totalItems: pagination.total || 0,
                    onPageChange: (newPage) => setPage(newPage),
                  }}
                  onRowClick={handleVulnerabilityClick}
                  rowActions={getRowActions()}
                  initialSorting={[
                    { id: sortField === 'severity' ? 'severity' : 'cveId', desc: sortOrder === 'desc' }
                  ]}
                  className=""
                />

                {vulnerabilities.length === 0 && !loading && (
                  <div className="text-center py-8 text-caption uppercase tracking-widest text-muted-foreground/40">
                    {search || severityFilter
                      ? `No vulnerabilities found matching current filters`
                      : "No vulnerabilities found"}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Vulnerability Details Modal */}
      <VulnerabilityDetailsModal
        vulnerability={selectedVulnerability}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedVulnerability(null);
        }}
      />
    </div>
  );

  // Table column definitions
  function getLibraryTableColumns(): ColumnDefinition<VulnerabilityData>[] {
    return [
      {
        key: 'cveId',
        header: 'CVE ID',
        type: 'cve-link',
        sortable: true,
      },
      {
        key: 'severity',
        header: 'Severity',
        type: 'badge',
        sortable: true,
      },
      {
        key: 'cvssScore',
        header: 'CVSS Score',
        type: 'badge',
        sortable: true,
        accessorFn: (row: VulnerabilityData) => row.cvssScore ? row.cvssScore.toFixed(1) : 'N/A',
      },
      {
        key: 'packageName',
        header: 'Package',
        type: 'text',
        sortable: true,
      },
      {
        key: 'affectedImages',
        header: 'Affected Images',
        type: 'interactive-badge',
        sortable: true,
        cellProps: {
          onClick: (row: VulnerabilityData, value: any) => {
            const firstImage = row.affectedImages[0];
            if (firstImage) {
              const imageName = getImageName(firstImage.imageName);
              router.push(`/images/${encodeURIComponent(imageName)}`);
            }
          },
          label: (value: any) => value?.length > 0 ? `${value.length} images` : 'None',
        },
        accessorFn: (row: VulnerabilityData) => row.affectedImages,
      },
      {
        key: 'falsePositiveImages',
        header: 'False Positives',
        type: 'interactive-badge',
        sortable: true,
        cellProps: {
          onClick: (row: VulnerabilityData, value: any) => {
            const firstFp = row.falsePositiveImages[0];
            if (firstFp) {
              const imageName = getImageName(firstFp);
              router.push(`/images/${encodeURIComponent(imageName)}`);
            }
          },
          label: (value: any) => value?.length > 0 ? `${value.length} FPs` : 'None',
          variant: (value: any) => value?.length > 0 ? 'secondary' : 'outline',
        },
        accessorFn: (row: VulnerabilityData) => row.falsePositiveImages,
      },
      {
        key: 'description',
        header: 'Description',
        type: 'text',
      },
    ];
  }

  // Row actions
  function getRowActions(): RowAction<VulnerabilityData>[] {
    return [
      {
        label: 'View Details',
        icon: <ExternalLink className="h-4 w-4 mr-1" />,
        action: (row) => {
          window.open(`https://nvd.nist.gov/vuln/detail/${row.cveId}`, '_blank');
        },
        variant: 'outline',
      },
    ];
  }

}
