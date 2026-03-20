'use client';

import React, { useState, useEffect } from 'react';
import {
  IconBug,
  IconPackage,
  IconShield,
  IconSettings,
} from "@tabler/icons-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CveClassificationDialog } from "@/components/dialogs/cve-classification-dialog";
import { VulnerabilityDetailModal } from "@/components/dialogs/VulnerabilityDetailModal";
import { PackageDetailModal } from "@/components/dialogs/PackageDetailModal";
import { VulnerabilitiesTab } from "./findings/VulnerabilitiesTab";
import { PackagesTab } from "./findings/PackagesTab";
import { ComplianceTab } from "./findings/ComplianceTab";
import { EfficiencyTab } from "./findings/EfficiencyTab";

interface ScanDetailsNormalizedProps {
  scanId: string;
  scanData: any;
  showFalsePositives: boolean;
  consolidatedClassifications: any[];
  onClassificationChange: () => void;
}

export function ScanDetailsNormalized({
  scanId,
  scanData,
  showFalsePositives,
  consolidatedClassifications,
  onClassificationChange
}: ScanDetailsNormalizedProps) {
  const [findings, setFindings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  // Individual search states for each tab
  const [vulnerabilitySearch, setVulnerabilitySearch] = useState("");
  const [packageSearch, setPackageSearch] = useState("");
  const [complianceSearch, setComplianceSearch] = useState("");
  const [efficiencySearch, setEfficiencySearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [sortField, setSortField] = useState("severity");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [selectedCveId, setSelectedCveId] = useState<string>("");
  const [selectedPackageName, setSelectedPackageName] = useState<string>("");
  const [classificationDialogOpen, setClassificationDialogOpen] = useState(false);
  const [selectedVulnerability, setSelectedVulnerability] = useState<any>(null);
  const [vulnerabilityModalOpen, setVulnerabilityModalOpen] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<any>(null);
  const [packageModalOpen, setPackageModalOpen] = useState(false);

  // Fetch normalized findings
  useEffect(() => {
    fetchFindings();
  }, [scanId, severityFilter, sourceFilter]);

  const fetchFindings = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        type: 'all',
        ...(severityFilter !== 'all' && { severity: severityFilter }),
        ...(sourceFilter !== 'all' && { source: sourceFilter })
      });

      const response = await fetch(`/api/scans/${scanId}/findings?${params}`);
      const data = await response.json();
      setFindings(data);
    } catch (error) {
      console.error('Failed to fetch findings:', error);
    } finally {
      setLoading(false);
    }
  };

  // Helper functions for classifications
  const getClassification = (cveId: string) => {
    return consolidatedClassifications.find((c) => {
      const directCveId = c.cveId;
      const nestedCveId = c.imageVulnerability?.vulnerability?.cveId;
      return directCveId === cveId || nestedCveId === cveId;
    });
  };

  const isFalsePositive = (cveId: string) => {
    const classification = getClassification(cveId);
    return classification?.isFalsePositive ?? false;
  };

  const getComment = (cveId: string) => {
    const classification = getClassification(cveId);
    return classification?.comment || undefined;
  };

  const getSourceBadge = (source: string) => {
    const colors: Record<string, string> = {
      trivy: 'bg-blue-600',
      grype: 'bg-purple-600',
      osv: 'bg-green-600',
      syft: 'bg-indigo-600',
      dockle: 'bg-pink-600',
      dive: 'bg-teal-600'
    };
    return (
      <Badge variant="outline" className={`${colors[source]} text-white border-0`}>
        {source}
      </Badge>
    );
  };

  if (loading) {
    return <div className="p-4">Loading scan findings...</div>;
  }

  if (!findings) {
    return <div className="p-4">No findings available</div>;
  }

  // Filter out false positives if needed
  const filterFalsePositives = (items: any[]) => {
    if (showFalsePositives) return items;
    return items.filter(item => !isFalsePositive(item.cveId || item.id));
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Vulnerabilities</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{findings.vulnerabilities?.total || 0}</div>
            <div className="flex gap-2 mt-2">
              {findings.vulnerabilities?.bySeverity && Object.entries(findings.vulnerabilities.bySeverity).map(([sev, count]) => (
                (count as number) > 0 && (
                  <span key={sev} className="text-xs">
                    {sev}: {count as number}
                  </span>
                )
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Packages</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{findings.packages?.total || 0}</div>
            <p className="text-xs text-muted-foreground mt-2">
              {Object.keys(findings.packages?.byType || {}).length} types
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Compliance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{findings.compliance?.total || 0}</div>
            <p className="text-xs text-muted-foreground mt-2">
              Grade: {findings.summary?.complianceGrade || 'N/A'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Risk Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{findings.summary?.aggregatedRiskScore || scanData?.riskScore || 0}</div>
            <p className="text-xs text-muted-foreground mt-2">
              {findings.correlations?.multiSource || 0} multi-source findings
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Global Filters */}
      <div className="flex justify-end gap-4">
        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severities</SelectItem>
            <SelectItem value="CRITICAL">Critical</SelectItem>
            <SelectItem value="HIGH">High</SelectItem>
            <SelectItem value="MEDIUM">Medium</SelectItem>
            <SelectItem value="LOW">Low</SelectItem>
            <SelectItem value="INFO">Info</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            <SelectItem value="trivy">Trivy</SelectItem>
            <SelectItem value="grype">Grype</SelectItem>
            <SelectItem value="osv">OSV</SelectItem>
            <SelectItem value="syft">Syft</SelectItem>
            <SelectItem value="dockle">Dockle</SelectItem>
            <SelectItem value="dive">Dive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Findings Tabs */}
      <Tabs defaultValue="vulnerabilities" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="vulnerabilities" className="flex items-center gap-2">
            <IconBug className="h-4 w-4" />
            Vulnerabilities ({findings.vulnerabilities?.total || 0})
          </TabsTrigger>
          <TabsTrigger value="packages" className="flex items-center gap-2">
            <IconPackage className="h-4 w-4" />
            Packages ({findings.packages?.total || 0})
          </TabsTrigger>
          <TabsTrigger value="compliance" className="flex items-center gap-2">
            <IconShield className="h-4 w-4" />
            Compliance ({findings.compliance?.total || 0})
          </TabsTrigger>
          <TabsTrigger value="efficiency" className="flex items-center gap-2">
            <IconSettings className="h-4 w-4" />
            Efficiency ({findings.efficiency?.total || 0})
          </TabsTrigger>
        </TabsList>

        {/* Vulnerabilities Tab */}
        <TabsContent value="vulnerabilities">
          <VulnerabilitiesTab
            vulnerabilities={filterFalsePositives(findings.vulnerabilities?.findings || [])}
            vulnerabilitySearch={vulnerabilitySearch}
            onVulnerabilitySearchChange={setVulnerabilitySearch}
            sortField={sortField}
            sortOrder={sortOrder}
            onSortFieldChange={setSortField}
            onSortOrderToggle={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            isFalsePositive={isFalsePositive}
            getComment={getComment}
            getSourceBadge={getSourceBadge}
            onVulnerabilityClick={(vuln) => {
              setSelectedVulnerability(vuln);
              setVulnerabilityModalOpen(true);
            }}
            onClassifyClick={(cveId, packageName) => {
              setSelectedCveId(cveId);
              setSelectedPackageName(packageName);
              setClassificationDialogOpen(true);
            }}
          />
        </TabsContent>

        {/* Packages Tab */}
        <TabsContent value="packages">
          <PackagesTab
            packages={findings.packages?.findings || []}
            packageSearch={packageSearch}
            onPackageSearchChange={setPackageSearch}
            getSourceBadge={getSourceBadge}
            onPackageClick={(pkg) => {
              setSelectedPackage(pkg);
              setPackageModalOpen(true);
            }}
          />
        </TabsContent>

        {/* Compliance Tab */}
        <TabsContent value="compliance">
          <ComplianceTab
            compliance={findings.compliance?.findings || []}
            complianceSearch={complianceSearch}
            onComplianceSearchChange={setComplianceSearch}
            getSourceBadge={getSourceBadge}
          />
        </TabsContent>

        {/* Efficiency Tab */}
        <TabsContent value="efficiency">
          <EfficiencyTab
            efficiency={findings.efficiency?.findings || []}
            totalSizeBytes={findings.efficiency?.totalSizeBytes}
            totalWastedBytes={findings.efficiency?.totalWastedBytes}
            efficiencySearch={efficiencySearch}
            onEfficiencySearchChange={setEfficiencySearch}
          />
        </TabsContent>
      </Tabs>

      {/* Modals */}
      <VulnerabilityDetailModal
        isOpen={vulnerabilityModalOpen}
        onClose={() => setVulnerabilityModalOpen(false)}
        vulnerability={selectedVulnerability}
        classification={selectedVulnerability ? getClassification(selectedVulnerability.cveId) : null}
      />

      <PackageDetailModal
        isOpen={packageModalOpen}
        onClose={() => setPackageModalOpen(false)}
        packageData={selectedPackage}
      />

      {/* CVE Classification Dialog */}
      <CveClassificationDialog
        isOpen={classificationDialogOpen}
        onClose={() => setClassificationDialogOpen(false)}
        cveId={selectedCveId}
        imageId={scanData?.image?.id}
        currentClassification={getClassification(selectedCveId)}
        onSave={async (classification) => {
          if (!selectedPackageName || !scanData?.image?.id) {
            console.error('Cannot save classification: missing package name or image ID');
            return;
          }

          try {
            const response = await fetch(
              `/api/scans/${scanId}/cve-classifications`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  cveId: classification.cveId,
                  packageName: selectedPackageName,
                  isFalsePositive: classification.isFalsePositive,
                  comment: classification.comment,
                  createdBy: classification.createdBy
                })
              }
            );

            if (!response.ok) {
              const error = await response.json();
              throw new Error(error.error || 'Failed to save classification');
            }

            // Refresh classifications after successful save
            await onClassificationChange();
            setClassificationDialogOpen(false);
          } catch (error) {
            console.error('Failed to save CVE classification:', error);
            alert(`Failed to save classification: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }}
      />
    </div>
  );
}
