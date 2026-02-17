"use client";

import {
  IconBug,
  IconPackage,
  IconShield,
  IconSettings,
  IconStack,
} from "@tabler/icons-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrivyResultsTab } from "./TrivyResultsTab";
import { GrypeResultsTab } from "./GrypeResultsTab";
import { SyftResultsTab } from "./SyftResultsTab";
import { DockleResultsTab } from "./DockleResultsTab";
import { OsvResultsTab } from "./OsvResultsTab";
import { DiveResultsTab } from "./DiveResultsTab";

interface RawScannerTabsProps {
  trivyResults: any;
  grypeResults: any;
  syftResults: any;
  dockleResults: any;
  osvResults: any;
  diveResults: any;
  showFalsePositives: boolean;
  setShowFalsePositives: (value: boolean) => void;
  classificationsLoading: boolean;
  getClassification: (cveId: string) => any;
  isFalsePositive: (cveId: string) => boolean;
  getComment: (cveId: string) => string | undefined;
  onOpenClassificationDialog: (cveId: string) => void;
  deleteClassification: (cveId: string) => Promise<void>;
  onVulnerabilityClick: (vuln: any, source: "trivy" | "grype") => void;
}

export function RawScannerTabs({
  trivyResults,
  grypeResults,
  syftResults,
  dockleResults,
  osvResults,
  diveResults,
  showFalsePositives,
  setShowFalsePositives,
  classificationsLoading,
  getClassification,
  isFalsePositive,
  getComment,
  onOpenClassificationDialog,
  deleteClassification,
  onVulnerabilityClick,
}: RawScannerTabsProps) {
  return (
    <Tabs defaultValue="trivy" className="w-full">
      <TabsList
        className={`grid w-full ${
          diveResults?.layer && diveResults.layer.length > 0 && osvResults
            ? "grid-cols-6"
            : (diveResults?.layer && diveResults.layer.length > 0) || osvResults
            ? "grid-cols-5"
            : "grid-cols-4"
        }`}
      >
        <TabsTrigger value="trivy" className="flex items-center gap-2">
          <IconBug className="h-4 w-4" />
          Trivy
        </TabsTrigger>
        <TabsTrigger value="grype" className="flex items-center gap-2">
          <IconShield className="h-4 w-4" />
          Grype
        </TabsTrigger>
        <TabsTrigger value="syft" className="flex items-center gap-2">
          <IconPackage className="h-4 w-4" />
          Syft
        </TabsTrigger>
        <TabsTrigger value="dockle" className="flex items-center gap-2">
          <IconSettings className="h-4 w-4" />
          Dockle
        </TabsTrigger>
        {osvResults && (
          <TabsTrigger value="osv" className="flex items-center gap-2">
            <IconPackage className="h-4 w-4" />
            OSV
          </TabsTrigger>
        )}
        {diveResults?.layer && diveResults.layer.length > 0 && (
          <TabsTrigger value="dive" className="flex items-center gap-2">
            <IconStack className="h-4 w-4" />
            Layers ({diveResults.layer.length})
          </TabsTrigger>
        )}
      </TabsList>

      <TabsContent value="trivy" className="space-y-4">
        <TrivyResultsTab
          trivyResults={trivyResults}
          showFalsePositives={showFalsePositives}
          setShowFalsePositives={setShowFalsePositives}
          classificationsLoading={classificationsLoading}
          getClassification={getClassification}
          isFalsePositive={isFalsePositive}
          getComment={getComment}
          onOpenClassificationDialog={onOpenClassificationDialog}
          deleteClassification={deleteClassification}
          onVulnerabilityClick={onVulnerabilityClick}
        />
      </TabsContent>

      <TabsContent value="grype" className="space-y-4">
        <GrypeResultsTab
          grypeResults={grypeResults}
          showFalsePositives={showFalsePositives}
          setShowFalsePositives={setShowFalsePositives}
          classificationsLoading={classificationsLoading}
          getClassification={getClassification}
          isFalsePositive={isFalsePositive}
          getComment={getComment}
          onOpenClassificationDialog={onOpenClassificationDialog}
          deleteClassification={deleteClassification}
          onVulnerabilityClick={onVulnerabilityClick}
        />
      </TabsContent>

      <TabsContent value="syft" className="space-y-4">
        <SyftResultsTab syftResults={syftResults} />
      </TabsContent>

      <TabsContent value="dockle" className="space-y-4">
        <DockleResultsTab dockleResults={dockleResults} />
      </TabsContent>

      {osvResults && (
        <TabsContent value="osv" className="space-y-4">
          <OsvResultsTab osvResults={osvResults} />
        </TabsContent>
      )}

      {diveResults?.layer && diveResults.layer.length > 0 && (
        <TabsContent value="dive" className="space-y-4">
          <DiveResultsTab diveResults={diveResults} />
        </TabsContent>
      )}
    </Tabs>
  );
}
