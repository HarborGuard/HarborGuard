"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  IconBug,
  IconSearch,
  IconExternalLink,
} from "@tabler/icons-react";
import { VulnerabilityDetailsModal } from "@/components/vulnerability-details-modal";
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
import { getSeverityBadgeVariant } from "@/lib/severity-utils";
import { getImageName } from "@/lib/image-utils";
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
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <div className="animate-pulse">
                    <IconBug className="h-5 w-5" />
                  </div>
                  Loading Vulnerability Library
                </CardTitle>
                <CardDescription>
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
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <IconBug className="h-5 w-5" />
                Vulnerability Library Overview
              </CardTitle>
              <CardDescription>
                All vulnerabilities across scanned images with false positive
                tracking
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                <div className="text-center">
                  <p className="text-2xl font-bold">{stats.totalCves}</p>
                  <p className="text-sm text-muted-foreground">Total CVEs</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-red-600">
                    {stats.criticalCves}
                  </p>
                  <p className="text-sm text-muted-foreground">Critical</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-orange-600">
                    {stats.highCves}
                  </p>
                  <p className="text-sm text-muted-foreground">High</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-orange-600">
                    {stats.highRiskCves}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    High CVSS (≥7.0)
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-600">
                    {stats.fixableCves}
                  </p>
                  <p className="text-sm text-muted-foreground">Fixable</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-purple-600">
                    {stats.cvesWithFalsePositives}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    With False Positives
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-blue-600">
                    {stats.fixablePercent}%
                  </p>
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
                All vulnerabilities found across scanned images with false
                positive tracking
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
                  <Select
                    value={severityFilter || "all"}
                    onValueChange={(value) =>
                      setSeverityFilter(value === "all" ? "" : value)
                    }
                  >
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
                  <div className="text-center py-8 text-muted-foreground">
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
        icon: <IconExternalLink className="h-4 w-4 mr-1" />,
        action: (row) => {
          window.open(`https://nvd.nist.gov/vuln/detail/${row.cveId}`, '_blank');
        },
        variant: 'outline',
      },
    ];
  }

}
