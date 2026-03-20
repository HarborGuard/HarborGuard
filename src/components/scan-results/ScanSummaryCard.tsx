"use client";

import {
  IconBug,
  IconPackage,
  IconShield,
  IconSettings,
  IconDownload,
  IconClock,
  IconStack,
  IconChevronDown,
  IconFileTypePdf,
  IconFileSpreadsheet,
} from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ScanSummaryCardProps {
  scanData: any;
  decodedImageName: string;
  trivyResults: any;
  grypeResults: any;
  syftResults: any;
  dockleResults: any;
  osvResults: any;
  diveResults: any;
  onGeneratePdf: () => void;
  onGenerateXlsx: () => void;
  onDownloadZip: () => void;
  onDownloadReport: (reportType: string) => void;
}

function ToolBadge({ name, url }: { name: string; url: string }) {
  return (
    <Badge
      variant="outline"
      className="text-xs hover:bg-muted/50 transition-colors"
    >
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center"
      >
        {name}
      </a>
    </Badge>
  );
}

export function ScanSummaryCard({
  scanData,
  decodedImageName,
  trivyResults,
  grypeResults,
  syftResults,
  dockleResults,
  osvResults,
  diveResults,
  onGeneratePdf,
  onGenerateXlsx,
  onDownloadZip,
  onDownloadReport,
}: ScanSummaryCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <IconClock className="h-5 w-5" />
            Scan Summary
          </CardTitle>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="flex items-center gap-2">
                  <IconFileTypePdf className="h-4 w-4" />
                  Generate Report
                  <IconChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onGeneratePdf}>
                  <IconFileTypePdf className="h-4 w-4 mr-2" />
                  Export as PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onGenerateXlsx}>
                  <IconFileSpreadsheet className="h-4 w-4 mr-2" />
                  Export as XLSX (Multi-page)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              onClick={onDownloadZip}
              className="flex items-center gap-2"
            >
              <IconDownload className="h-4 w-4" />
              Export Data
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <IconChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {trivyResults && (
                  <DropdownMenuItem onClick={() => onDownloadReport("trivy")}>
                    <IconBug className="h-4 w-4 mr-2" />
                    Trivy Report
                  </DropdownMenuItem>
                )}
                {grypeResults && (
                  <DropdownMenuItem onClick={() => onDownloadReport("grype")}>
                    <IconShield className="h-4 w-4 mr-2" />
                    Grype Report
                  </DropdownMenuItem>
                )}
                {syftResults && (
                  <DropdownMenuItem onClick={() => onDownloadReport("syft")}>
                    <IconPackage className="h-4 w-4 mr-2" />
                    Syft Report
                  </DropdownMenuItem>
                )}
                {dockleResults && (
                  <DropdownMenuItem onClick={() => onDownloadReport("dockle")}>
                    <IconSettings className="h-4 w-4 mr-2" />
                    Dockle Report
                  </DropdownMenuItem>
                )}
                {osvResults && (
                  <DropdownMenuItem onClick={() => onDownloadReport("osv")}>
                    <IconPackage className="h-4 w-4 mr-2" />
                    OSV Report
                  </DropdownMenuItem>
                )}
                {diveResults && (
                  <DropdownMenuItem onClick={() => onDownloadReport("dive")}>
                    <IconStack className="h-4 w-4 mr-2" />
                    Dive Report
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Scan Date
            </p>
            <p className="text-sm">
              {scanData.startedAt
                ? new Date(scanData.startedAt).toLocaleString()
                : "N/A"}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Duration
            </p>
            <p className="text-sm">
              {scanData.startedAt && scanData.finishedAt
                ? (() => {
                    const start = new Date(scanData.startedAt);
                    const end = new Date(scanData.finishedAt);
                    const diffMs = end.getTime() - start.getTime();
                    const minutes = Math.floor(diffMs / 60000);
                    const seconds = Math.floor((diffMs % 60000) / 1000);
                    return `${minutes}m ${seconds}s`;
                  })()
                : scanData.status === "RUNNING"
                ? "Running..."
                : "N/A"}
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              Tools Used
            </p>
            <div className="flex gap-1 flex-wrap mt-1">
              <ToolBadge name="Trivy" url="https://github.com/aquasecurity/trivy" />
              <ToolBadge name="Grype" url="https://github.com/anchore/grype" />
              <ToolBadge name="Syft" url="https://github.com/anchore/syft" />
              <ToolBadge name="Dockle" url="https://github.com/goodwithtech/dockle" />
              {osvResults && (
                <ToolBadge name="OSV" url="https://github.com/google/osv-scanner" />
              )}
              {diveResults && (
                <ToolBadge name="Dive" url="https://github.com/wagoodman/dive" />
              )}
            </div>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Status</p>
            <Badge className="bg-green-500 text-white hover:bg-green-600">
              Complete
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
