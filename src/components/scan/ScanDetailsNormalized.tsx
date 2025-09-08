'use client';

import React, { useState, useEffect } from 'react';
import {
  IconBug,
  IconPackage,
  IconShield,
  IconSettings,
  IconDownload,
  IconExternalLink,
  IconInfoCircle,
  IconSearch,
  IconSortAscending,
  IconSortDescending,
  IconMessage,
} from "@tabler/icons-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { VulnerabilityUrlMenu } from "@/components/vulnerability-url-menu";
import { CveClassificationDialog } from "@/components/cve-classification-dialog";
import { VulnerabilityDetailModal } from "./VulnerabilityDetailModal";
import { PackageDetailModal } from "./PackageDetailModal";

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

  // Filter functions for each tab
  const filterVulnerabilities = (items: any[]) => {
    if (!items) return [];
    if (!vulnerabilitySearch) return items;
    
    const searchLower = vulnerabilitySearch.toLowerCase();
    return items.filter(item => {
      return (
        item.cveId?.toLowerCase().includes(searchLower) ||
        item.packageName?.toLowerCase().includes(searchLower) ||
        item.description?.toLowerCase().includes(searchLower) ||
        item.severity?.toLowerCase().includes(searchLower) ||
        item.fixedVersion?.toLowerCase().includes(searchLower)
      );
    });
  };

  const filterPackages = (items: any[]) => {
    if (!items) return [];
    if (!packageSearch) return items;
    
    const searchLower = packageSearch.toLowerCase();
    return items.filter(item => {
      return (
        item.packageName?.toLowerCase().includes(searchLower) ||
        item.version?.toLowerCase().includes(searchLower) ||
        item.type?.toLowerCase().includes(searchLower) ||
        item.ecosystem?.toLowerCase().includes(searchLower) ||
        item.license?.toLowerCase().includes(searchLower)
      );
    });
  };

  const filterCompliance = (items: any[]) => {
    if (!items) return [];
    if (!complianceSearch) return items;
    
    const searchLower = complianceSearch.toLowerCase();
    return items.filter(item => {
      return (
        item.ruleName?.toLowerCase().includes(searchLower) ||
        item.category?.toLowerCase().includes(searchLower) ||
        item.message?.toLowerCase().includes(searchLower) ||
        item.severity?.toLowerCase().includes(searchLower)
      );
    });
  };

  const filterEfficiency = (items: any[]) => {
    if (!items) return [];
    if (!efficiencySearch) return items;
    
    const searchLower = efficiencySearch.toLowerCase();
    return items.filter(item => {
      return (
        item.findingType?.toLowerCase().includes(searchLower) ||
        item.description?.toLowerCase().includes(searchLower) ||
        item.layerIndex?.toString().includes(searchLower)
      );
    });
  };

  // Sort findings
  const sortFindings = (items: any[], field: string) => {
    if (!items) return [];
    
    return [...items].sort((a, b) => {
      let aVal = a[field];
      let bVal = b[field];
      
      // Handle severity sorting
      if (field === 'severity') {
        const severityOrder = { CRITICAL: 5, HIGH: 4, MEDIUM: 3, LOW: 2, INFO: 1 };
        aVal = severityOrder[aVal as keyof typeof severityOrder] || 0;
        bVal = severityOrder[bVal as keyof typeof severityOrder] || 0;
      }
      
      // Handle CVSS score
      if (field === 'cvssScore') {
        aVal = aVal || 0;
        bVal = bVal || 0;
      }
      
      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
  };

  const getSeverityBadge = (severity: string) => {
    const colors: Record<string, string> = {
      CRITICAL: 'bg-red-500',
      HIGH: 'bg-orange-500',
      MEDIUM: 'bg-yellow-500',
      LOW: 'bg-blue-500',
      INFO: 'bg-gray-500'
    };
    return (
      <Badge className={`${colors[severity] || 'bg-gray-500'} text-white`}>
        {severity}
      </Badge>
    );
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

  const formatLicense = (license: any): string => {
    if (!license) return '-';
    if (typeof license === 'string') return license;
    if (typeof license === 'object') {
      // Handle common license object structures
      if (license.name) return license.name;
      if (license.type) return license.type;
      if (license.value) return license.value;
      if (license.license) return license.license;
      // Handle SPDX expressions
      if (license.expression) return license.expression;
      // Handle array of licenses
      if (Array.isArray(license)) {
        return license.map(l => formatLicense(l)).filter(Boolean).join(', ');
      }
      // Try to extract first string value from object
      const values = Object.values(license);
      const firstString = values.find(v => typeof v === 'string');
      if (firstString) return firstString as string;
    }
    return '-';
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
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Vulnerability Findings</CardTitle>
                  <CardDescription>
                    Security vulnerabilities detected by scanners
                  </CardDescription>
                </div>
                <div className="relative w-64">
                  <IconSearch className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search vulnerabilities..."
                    value={vulnerabilitySearch}
                    onChange={(e) => setVulnerabilitySearch(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead 
                      className="cursor-pointer"
                      onClick={() => {
                        setSortField('cveId');
                        setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                      }}
                    >
                      CVE ID
                      {sortField === 'cveId' && (
                        sortOrder === 'asc' ? <IconSortAscending className="inline h-4 w-4 ml-1" /> : <IconSortDescending className="inline h-4 w-4 ml-1" />
                      )}
                    </TableHead>
                    <TableHead>Package</TableHead>
                    <TableHead 
                      className="cursor-pointer"
                      onClick={() => {
                        setSortField('severity');
                        setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                      }}
                    >
                      Severity
                      {sortField === 'severity' && (
                        sortOrder === 'asc' ? <IconSortAscending className="inline h-4 w-4 ml-1" /> : <IconSortDescending className="inline h-4 w-4 ml-1" />
                      )}
                    </TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead 
                      className="cursor-pointer"
                      onClick={() => {
                        setSortField('cvssScore');
                        setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                      }}
                    >
                      CVSS
                      {sortField === 'cvssScore' && (
                        sortOrder === 'asc' ? <IconSortAscending className="inline h-4 w-4 ml-1" /> : <IconSortDescending className="inline h-4 w-4 ml-1" />
                      )}
                    </TableHead>
                    <TableHead>Fixed Version</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortFindings(filterVulnerabilities(filterFalsePositives(findings.vulnerabilities?.findings || [])), sortField).map((vuln: any) => {
                    const comment = getComment(vuln.cveId);
                    return (
                    <TableRow 
                      key={`${vuln.id}-${vuln.source}`} 
                      className={`${isFalsePositive(vuln.cveId) ? 'opacity-50' : ''} cursor-pointer hover:bg-muted/50`}
                      onClick={() => {
                        setSelectedVulnerability(vuln);
                        setVulnerabilityModalOpen(true);
                      }}
                    >
                      <TableCell>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm">{vuln.cveId}</span>
                            {isFalsePositive(vuln.cveId) && (
                              <Badge variant="outline" className="text-xs">FP</Badge>
                            )}
                          </div>
                          {comment && (
                            <div className="flex items-start gap-1 mt-1">
                              <IconMessage className="h-3 w-3 text-muted-foreground mt-0.5 flex-shrink-0" />
                              <span className="text-xs text-muted-foreground italic">{comment}</span>
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {vuln.packageName}
                        {vuln.installedVersion && (
                          <span className="text-muted-foreground"> @ {vuln.installedVersion}</span>
                        )}
                      </TableCell>
                      <TableCell>{getSeverityBadge(vuln.severity)}</TableCell>
                      <TableCell>{getSourceBadge(vuln.source)}</TableCell>
                      <TableCell>{vuln.cvssScore?.toFixed(1) || '-'}</TableCell>
                      <TableCell className="font-mono text-sm text-green-600">
                        {vuln.fixedVersion || '-'}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="flex gap-2">
                          <VulnerabilityUrlMenu
                            cve={vuln.cveId}
                            packageName={vuln.packageName}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedCveId(vuln.cveId);
                              setSelectedPackageName(vuln.packageName);
                              setClassificationDialogOpen(true);
                            }}
                          >
                            <IconInfoCircle className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )})}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Packages Tab */}
        <TabsContent value="packages">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Package Inventory</CardTitle>
                  <CardDescription>
                    All packages and dependencies detected in the image
                  </CardDescription>
                </div>
                <div className="relative w-64">
                  <IconSearch className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search packages..."
                    value={packageSearch}
                    onChange={(e) => setPackageSearch(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Package Name</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Ecosystem</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>License</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filterPackages(findings.packages?.findings || []).map((pkg: any) => (
                    <TableRow 
                      key={`${pkg.id}-${pkg.source}`}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => {
                        setSelectedPackage(pkg);
                        setPackageModalOpen(true);
                      }}
                    >
                      <TableCell className="font-mono text-sm">{pkg.packageName}</TableCell>
                      <TableCell className="font-mono text-sm">{pkg.version || '-'}</TableCell>
                      <TableCell>{pkg.type}</TableCell>
                      <TableCell>{pkg.ecosystem || '-'}</TableCell>
                      <TableCell>{getSourceBadge(pkg.source)}</TableCell>
                      <TableCell className="text-sm">{formatLicense(pkg.license)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Compliance Tab */}
        <TabsContent value="compliance">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Compliance Findings</CardTitle>
                  <CardDescription>
                    Container best practices and security compliance issues
                  </CardDescription>
                </div>
                <div className="relative w-64">
                  <IconSearch className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search compliance issues..."
                    value={complianceSearch}
                    onChange={(e) => setComplianceSearch(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rule</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Source</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortFindings(filterCompliance(findings.compliance?.findings || []), 'severity').map((comp: any) => (
                    <TableRow key={`${comp.id}-${comp.source}`}>
                      <TableCell className="font-mono text-sm">{comp.ruleName}</TableCell>
                      <TableCell>{comp.category}</TableCell>
                      <TableCell>{getSeverityBadge(comp.severity)}</TableCell>
                      <TableCell className="max-w-md truncate">{comp.message}</TableCell>
                      <TableCell>{getSourceBadge(comp.source)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Efficiency Tab */}
        <TabsContent value="efficiency">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Efficiency Analysis</CardTitle>
                  <CardDescription>
                    Image size optimization and layer efficiency findings
                  </CardDescription>
                </div>
                <div className="relative w-64">
                  <IconSearch className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search efficiency issues..."
                    value={efficiencySearch}
                    onChange={(e) => setEfficiencySearch(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium">Total Size</p>
                    <p className="text-2xl font-bold">
                      {findings.efficiency?.totalSizeBytes ? 
                        `${(BigInt(findings.efficiency.totalSizeBytes) / BigInt(1024) / BigInt(1024)).toString()} MB` : 
                        '0 MB'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Wasted Space</p>
                    <p className="text-2xl font-bold text-orange-500">
                      {findings.efficiency?.totalWastedBytes ? 
                        `${(BigInt(findings.efficiency.totalWastedBytes) / BigInt(1024) / BigInt(1024)).toString()} MB` : 
                        '0 MB'}
                    </p>
                  </div>
                </div>
                
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Layer</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Size Impact</TableHead>
                      <TableHead>Efficiency Score</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filterEfficiency(findings.efficiency?.findings || []).map((eff: any) => (
                      <TableRow key={eff.id}>
                        <TableCell>{eff.findingType}</TableCell>
                        <TableCell>{eff.layerIndex !== null ? `#${eff.layerIndex}` : '-'}</TableCell>
                        <TableCell className="max-w-md truncate">{eff.description}</TableCell>
                        <TableCell>
                          {eff.wastedBytes ? 
                            `${(BigInt(eff.wastedBytes) / BigInt(1024) / BigInt(1024)).toString()} MB` : 
                            '-'}
                        </TableCell>
                        <TableCell>
                          {eff.efficiencyScore ? `${eff.efficiencyScore.toFixed(1)}%` : '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
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