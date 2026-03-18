"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import {
  IconBug,
  IconShield,
  IconInfoCircle,
} from "@tabler/icons-react";

import { ScanDetailsNormalized } from "@/components/scan/ScanDetailsNormalized";
import { Button } from "@/components/ui/button";
import { VulnerabilityDetailsModal } from "@/components/dialogs/vulnerability-details-modal";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScanDetailsSkeleton } from "@/components/images/image-loading";
import { CveClassificationDialog } from "@/components/dialogs/cve-classification-dialog";
import { PatchAnalysis } from "@/components/analysis/patch-analysis";
import { useScanData } from "@/hooks/useScanData";
import { useCveClassifications } from "@/hooks/useCveClassifications";
import { ScanSummaryCard, RawScannerTabs } from "@/components/scan-results";

export default function ScanResultsPage() {
  const params = useParams();
  const imageName = params.name as string;
  const scanId = params.scanId as string;

  // Decode the image name in case it has special characters
  const decodedImageName = decodeURIComponent(imageName);

  // Custom hooks for data fetching and classification management
  const {
    scanData,
    loading,
    error,
    showRawOutput,
    trivyResults,
    grypeResults,
    syftResults,
    dockleResults,
    osvResults,
    diveResults,
  } = useScanData(scanId);

  const {
    consolidatedClassifications,
    classificationsLoading,
    getClassification,
    isFalsePositive,
    getComment,
    saveClassification,
    deleteClassification,
    fetchConsolidatedClassifications,
  } = useCveClassifications(decodedImageName, scanData);

  // Classification dialog state
  const [classificationDialogOpen, setClassificationDialogOpen] =
    React.useState(false);
  const [selectedCveId, setSelectedCveId] = React.useState<string>("");
  const [showFalsePositives, setShowFalsePositives] = React.useState(true);

  // Vulnerability details modal state
  const [selectedVulnerability, setSelectedVulnerability] =
    React.useState<any>(null);
  const [isVulnModalOpen, setIsVulnModalOpen] = React.useState(false);

  // View mode state
  const [viewMode, setViewMode] = React.useState<"normalized" | "raw">(
    "normalized"
  );

  // CVE Classification handlers
  const handleOpenClassificationDialog = (cveId: string) => {
    setSelectedCveId(cveId);
    setClassificationDialogOpen(true);
  };

  const handleCloseClassificationDialog = () => {
    setClassificationDialogOpen(false);
    setSelectedCveId("");
  };

  const handleVulnerabilityClick = (
    vuln: any,
    source: "trivy" | "grype"
  ) => {
    const transformedVuln = {
      cveId:
        source === "trivy" ? vuln.VulnerabilityID : vuln.vulnerability?.id,
      severity:
        source === "trivy"
          ? vuln.Severity?.toLowerCase()
          : vuln.vulnerability?.severity?.toLowerCase(),
      description:
        source === "trivy"
          ? vuln.Description || vuln.Title
          : vuln.vulnerability?.description,
      cvssScore:
        source === "trivy"
          ? vuln.CVSS?.nvd?.V3Score || vuln.CVSS?.redhat?.V3Score
          : vuln.vulnerability?.cvss?.[0]?.metrics?.baseScore,
      cvssVector:
        source === "trivy"
          ? vuln.CVSS?.nvd?.V3Vector || vuln.CVSS?.redhat?.V3Vector
          : vuln.vulnerability?.cvss?.[0]?.vector,
      packageName: source === "trivy" ? vuln.PkgName : vuln.artifact?.name,
      installedVersion:
        source === "trivy" ? vuln.InstalledVersion : vuln.artifact?.version,
      fixedVersion:
        source === "trivy"
          ? vuln.FixedVersion
          : vuln.vulnerability?.fix?.versions?.[0],
      publishedDate:
        source === "trivy"
          ? vuln.PublishedDate
          : vuln.vulnerability?.dataSource,
      references:
        source === "trivy"
          ? vuln.References || []
          : vuln.vulnerability?.urls || [],
      affectedImages: [
        {
          imageName: decodedImageName,
          imageId: scanData?.imageId || "",
          isFalsePositive: isFalsePositive(
            source === "trivy"
              ? vuln.VulnerabilityID
              : vuln.vulnerability?.id
          ),
        },
      ],
      falsePositiveImages: [],
    };

    setSelectedVulnerability(transformedVuln);
    setIsVulnModalOpen(true);
  };

  // Export handlers
  const handleGeneratePdfReport = async () => {
    try {
      const response = await fetch(
        `/api/images/${encodeURIComponent(decodedImageName)}/scan/${scanId}/pdf-report`
      );
      if (!response.ok) throw new Error("PDF generation failed");
      downloadBlob(await response.blob(), `${decodedImageName.replace("/", "_")}_${scanId}_report.pdf`);
    } catch (error) {
      console.error("PDF generation failed:", error);
    }
  };

  const handleGenerateXlsxReport = async () => {
    try {
      const response = await fetch(
        `/api/images/${encodeURIComponent(decodedImageName)}/scan/${scanId}/xlsx-report`
      );
      if (!response.ok) throw new Error("XLSX generation failed");
      downloadBlob(await response.blob(), `${decodedImageName.replace("/", "_")}_${scanId}_report.xlsx`);
    } catch (error) {
      console.error("XLSX generation failed:", error);
    }
  };

  const handleDownloadZip = async () => {
    try {
      const response = await fetch(
        `/api/images/${encodeURIComponent(decodedImageName)}/scan/${scanId}/download`
      );
      if (!response.ok) throw new Error("Download failed");
      downloadBlob(await response.blob(), `${decodedImageName.replace("/", "_")}_${scanId}_reports.zip`);
    } catch (error) {
      console.error("Download failed:", error);
    }
  };

  const handleDownloadReport = async (reportType: string) => {
    try {
      const response = await fetch(
        `/api/images/${encodeURIComponent(decodedImageName)}/scan/${scanId}/${reportType}`
      );
      if (!response.ok) throw new Error("Download failed");
      downloadBlob(await response.blob(), `${decodedImageName.replace("/", "_")}_${scanId}_${reportType}.json`);
    } catch (error) {
      console.error("Download failed:", error);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex-1 overflow-auto">
        <ScanDetailsSkeleton />
      </div>
    );
  }

  // Error state
  if (error || !scanData) {
    return (
      <div className="flex-1 overflow-auto">
        <div className="@container/main flex flex-col gap-4 p-4 lg:p-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-500">
                <IconInfoCircle className="h-5 w-5" />
                Scan Not Found
              </CardTitle>
              <CardDescription>
                {error || "The requested scan could not be found"}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4 py-8">
              <p className="text-muted-foreground text-center">
                Scan &quot;{scanId}&quot; for image &quot;{decodedImageName}
                &quot; does not exist or may have been removed.
              </p>
              <Button asChild>
                <a href={`/images/${encodeURIComponent(decodedImageName)}`}>
                  Go Back to Image
                </a>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="@container/main flex flex-col gap-4 p-4 lg:p-6">
        {/* Scan Summary */}
        <ScanSummaryCard
          scanData={scanData}
          decodedImageName={decodedImageName}
          trivyResults={trivyResults}
          grypeResults={grypeResults}
          syftResults={syftResults}
          dockleResults={dockleResults}
          osvResults={osvResults}
          diveResults={diveResults}
          onGeneratePdf={handleGeneratePdfReport}
          onGenerateXlsx={handleGenerateXlsxReport}
          onDownloadZip={handleDownloadZip}
          onDownloadReport={handleDownloadReport}
        />

        {/* View Mode Toggle - Only show if raw output is enabled */}
        {showRawOutput ? (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Scan Results View</CardTitle>
                <div className="flex items-center gap-2">
                  <Button
                    variant={viewMode === "normalized" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setViewMode("normalized")}
                  >
                    <IconShield className="h-4 w-4 mr-2" />
                    Normalized View
                  </Button>
                  <Button
                    variant={viewMode === "raw" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setViewMode("raw")}
                  >
                    <IconBug className="h-4 w-4 mr-2" />
                    Raw Scanner Output
                  </Button>
                </div>
              </div>
            </CardHeader>
          </Card>
        ) : null}

        {/* Patch Analysis Component */}
        {scanData && (
          <PatchAnalysis
            scanId={scanId}
            imageId={scanData.imageId || scanData.scan?.imageId}
            imageName={imageName}
            imageTag={
              scanData.image?.tag || scanData.scan?.image?.tag || "latest"
            }
            onPatchExecute={(patchOperation) => {
              console.log("Patch operation started:", patchOperation);
            }}
          />
        )}

        {/* Display based on view mode */}
        {!showRawOutput || viewMode === "normalized" ? (
          <ScanDetailsNormalized
            scanId={scanId}
            scanData={scanData}
            showFalsePositives={showFalsePositives}
            consolidatedClassifications={consolidatedClassifications}
            onClassificationChange={fetchConsolidatedClassifications}
          />
        ) : (
          <RawScannerTabs
            trivyResults={trivyResults}
            grypeResults={grypeResults}
            syftResults={syftResults}
            dockleResults={dockleResults}
            osvResults={osvResults}
            diveResults={diveResults}
            showFalsePositives={showFalsePositives}
            setShowFalsePositives={setShowFalsePositives}
            classificationsLoading={classificationsLoading}
            getClassification={getClassification}
            isFalsePositive={isFalsePositive}
            getComment={getComment}
            onOpenClassificationDialog={handleOpenClassificationDialog}
            deleteClassification={deleteClassification}
            onVulnerabilityClick={handleVulnerabilityClick}
          />
        )}
      </div>

      <CveClassificationDialog
        isOpen={classificationDialogOpen}
        onClose={handleCloseClassificationDialog}
        cveId={selectedCveId}
        imageId={scanData?.image?.id || ""}
        currentClassification={getClassification(selectedCveId)}
        onSave={saveClassification}
      />

      {/* Vulnerability Details Modal */}
      <VulnerabilityDetailsModal
        vulnerability={selectedVulnerability}
        isOpen={isVulnModalOpen}
        onClose={() => {
          setIsVulnModalOpen(false);
          setSelectedVulnerability(null);
        }}
      />
    </div>
  );
}

/** Helper to trigger a browser download from a Blob. */
function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}
