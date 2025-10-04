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

interface VulnerabilityData {
  cveId: string;
  severity: string;
  description?: string;
  cvssScore?: number;
  packageName?: string;
  affectedImages: Array<{
    imageName: string;
    imageId: string;
    isFalsePositive: boolean;
  }>;
  totalAffectedImages: number;
  falsePositiveImages: string[];
  fixedVersion?: string;
  publishedDate?: string;
  references?: string[];
}

export default function LibraryHomePage() {
  const router = useRouter();

  const [vulnerabilities, setVulnerabilities] = React.useState<
    VulnerabilityData[]
  >([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [severityFilter, setSeverityFilter] = React.useState<string>("");
  const [sortField, setSortField] = React.useState<string>("severity");
  const [sortOrder, setSortOrder] = React.useState<"asc" | "desc">("desc");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(50);
  const [pagination, setPagination] = React.useState({
    total: 0,
    limit: 50,
    offset: 0,
    hasMore: false,
  });
  
  // Modal state
  const [selectedVulnerability, setSelectedVulnerability] = React.useState<VulnerabilityData | null>(null);
  const [isModalOpen, setIsModalOpen] = React.useState(false);

  // Fetch vulnerabilities from API
  const fetchVulnerabilities = React.useCallback(async () => {
    try {
      setLoading(true);
      const offset = (page - 1) * pageSize;
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        offset: offset.toString(),
      });

      if (search) params.append("search", search);
      if (severityFilter) params.append("severity", severityFilter);

      const response = await fetch(`/api/vulnerabilities?${params}`);
      if (!response.ok) throw new Error("Failed to fetch vulnerabilities");

      const data = await response.json();
      setVulnerabilities(data.vulnerabilities);
      setPagination(data.pagination);
    } catch (error) {
      console.error("Failed to fetch vulnerabilities:", error);
    } finally {
      setLoading(false);
    }
  }, [search, severityFilter, page, pageSize]);

  // Reset to page 1 when search or filter changes
  React.useEffect(() => {
    setPage(1);
  }, [search, severityFilter]);

  React.useEffect(() => {
    fetchVulnerabilities();
  }, [fetchVulnerabilities]);

  const sortedVulnerabilities = React.useMemo(() => {
    return [...vulnerabilities].sort((a, b) => {
      let aValue: any, bValue: any;

      switch (sortField) {
        case "cveId":
          aValue = a.cveId;
          bValue = b.cveId;
          break;
        case "severity":
          const severityPriority = {
            CRITICAL: 5,
            HIGH: 4,
            MEDIUM: 3,
            LOW: 2,
            INFO: 1,
            UNKNOWN: 0,
          };
          aValue =
            severityPriority[a.severity.toUpperCase() as keyof typeof severityPriority] || 0;
          bValue =
            severityPriority[b.severity.toUpperCase() as keyof typeof severityPriority] || 0;
          break;
        case "cvssScore":
          aValue = a.cvssScore || 0;
          bValue = b.cvssScore || 0;
          break;
        case "affectedImages":
          aValue = a.totalAffectedImages;
          bValue = b.totalAffectedImages;
          break;
        case "falsePositives":
          aValue = a.falsePositiveImages.length;
          bValue = b.falsePositiveImages.length;
          break;
        case "packageName":
          aValue = a.packageName || "";
          bValue = b.packageName || "";
          break;
        default:
          return 0;
      }

      if (sortOrder === "asc") {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });
  }, [vulnerabilities, sortField, sortOrder]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const getSeverityColor = (
    severity: string
  ) => {
    switch (severity.toUpperCase()) {
      case "CRITICAL":
        return "destructive";
      case "HIGH":
        return "destructive";
      case "MEDIUM":
        return "secondary";
      case "LOW":
        return "outline";
      case "INFO":
        return "outline";
      default:
        return "outline";
    }
  };

  const breadcrumbs = [
    { label: "Dashboard", href: "/" },
    { label: "Vulnerability Library" },
  ];
  
  // Handle vulnerability click
  const handleVulnerabilityClick = (vuln: VulnerabilityData) => {
    setSelectedVulnerability(vuln);
    setIsModalOpen(true);
  };

  // Calculate overall statistics
  const stats = React.useMemo(() => {
    const totalCves = vulnerabilities.length;
    const criticalCves = vulnerabilities.filter(
      (v) => v.severity.toUpperCase() === "CRITICAL"
    ).length;
    const highCves = vulnerabilities.filter(
      (v) => v.severity.toUpperCase() === "HIGH"
    ).length;
    const fixableCves = vulnerabilities.filter((v) => v.fixedVersion).length;
    const totalFalsePositives = vulnerabilities.reduce(
      (sum, v) => sum + v.falsePositiveImages.length,
      0
    );
    const cvesWithFalsePositives = vulnerabilities.filter(
      (v) => v.falsePositiveImages.length > 0
    ).length;
    const highRiskCves = vulnerabilities.filter(
      (v) => (v.cvssScore || 0) >= 7.0
    ).length;

    return {
      totalCves,
      criticalCves,
      highCves,
      fixableCves,
      totalFalsePositives,
      cvesWithFalsePositives,
      highRiskCves,
      fixablePercent:
        totalCves > 0 ? Math.round((fixableCves / totalCves) * 100) : 0,
    };
  }, [vulnerabilities]);

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
                  data={sortedVulnerabilities}
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
                    totalPages: pagination.total ? Math.ceil(pagination.total / pageSize) : 1,
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
              const imageName = firstImage.imageName.split(':')[0];
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
              const imageName = firstFp.split(':')[0];
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
