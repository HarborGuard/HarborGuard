"use client";

import {
  Bug,
  Package,
  Shield,
  Settings,
  Download,
  Clock,
  Layers,
  ChevronDown,
  FileText,
  Sheet,
} from "lucide-react";

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
      className="rounded-none border-white/10 uppercase tracking-widest text-caption hover:bg-white/5 transition-colors"
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
    <Card className="bg-surface-1 border-white/10 rounded-none">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-body-sm uppercase tracking-caps text-foreground">
            <Clock className="h-4 w-4 text-accent" />
            Scan Summary
          </CardTitle>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="flex items-center gap-2 rounded-none border-white/10 hover:bg-white/5 uppercase tracking-widest text-caption">
                  <FileText className="h-4 w-4" />
                  Generate Report
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-overlay border-white/10 rounded-none">
                <DropdownMenuItem onClick={onGeneratePdf} className="text-body-sm uppercase tracking-widest">
                  <FileText className="h-4 w-4 mr-2" />
                  Export as PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onGenerateXlsx} className="text-body-sm uppercase tracking-widest">
                  <Sheet className="h-4 w-4 mr-2" />
                  Export as XLSX (Multi-page)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              onClick={onDownloadZip}
              className="flex items-center gap-2 rounded-none uppercase tracking-widest text-caption"
            >
              <Download className="h-4 w-4" />
              Export Data
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="rounded-none border-white/10 hover:bg-white/5">
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-overlay border-white/10 rounded-none">
                {trivyResults && (
                  <DropdownMenuItem onClick={() => onDownloadReport("trivy")}>
                    <Bug className="h-4 w-4 mr-2" />
                    Trivy Report
                  </DropdownMenuItem>
                )}
                {grypeResults && (
                  <DropdownMenuItem onClick={() => onDownloadReport("grype")}>
                    <Shield className="h-4 w-4 mr-2" />
                    Grype Report
                  </DropdownMenuItem>
                )}
                {syftResults && (
                  <DropdownMenuItem onClick={() => onDownloadReport("syft")}>
                    <Package className="h-4 w-4 mr-2" />
                    Syft Report
                  </DropdownMenuItem>
                )}
                {dockleResults && (
                  <DropdownMenuItem onClick={() => onDownloadReport("dockle")}>
                    <Settings className="h-4 w-4 mr-2" />
                    Dockle Report
                  </DropdownMenuItem>
                )}
                {osvResults && (
                  <DropdownMenuItem onClick={() => onDownloadReport("osv")}>
                    <Package className="h-4 w-4 mr-2" />
                    OSV Report
                  </DropdownMenuItem>
                )}
                {diveResults && (
                  <DropdownMenuItem onClick={() => onDownloadReport("dive")}>
                    <Layers className="h-4 w-4 mr-2" />
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
            <p className="text-caption uppercase tracking-widest text-muted-foreground/50">
              Scan Date
            </p>
            <p className="text-body-sm text-foreground mt-1">
              {scanData.startedAt
                ? new Date(scanData.startedAt).toLocaleString()
                : "N/A"}
            </p>
          </div>
          <div>
            <p className="text-caption uppercase tracking-widest text-muted-foreground/50">
              Duration
            </p>
            <p className="text-body-sm text-foreground mt-1">
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
            <p className="text-caption uppercase tracking-widest text-muted-foreground/50">
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
            <p className="text-caption uppercase tracking-widest text-muted-foreground/50">Status</p>
            <Badge className="bg-green-600/80 text-white hover:bg-green-600 rounded-none uppercase tracking-widest text-caption">
              Complete
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
