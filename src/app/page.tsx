"use client";

import { VulnerabilityScatterplot } from "@/components/vulnerability-scatterplot";
import { DataTable } from "@/components/data-table";
import { SectionCards } from "@/components/section-cards";
import { ScanJobsMonitor } from "@/components/scan-jobs-monitor";
import { Skeleton } from "@/components/ui/skeleton";
import { useScans } from "@/hooks/useScans";
import { useApp } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";
import { IconRefresh } from "@tabler/icons-react";

export default function Page() {
  const { scans, stats, loading, dataReceived, dataReady, error } = useScans();
  const { state, loadMore } = useApp();

  // Show skeleton until data is fully processed and ready to display
  const showSkeleton = loading || !dataReady;

  // Create mock data for loading state to match the SectionCards interface
  const mockData = Array.from({ length: 5 }, (_, i) => ({
    id: i,
    riskScore: 0,
    severities: { crit: 0, high: 0, med: 0, low: 0 },
    status: "Loading",
    misconfigs: 0,
    secrets: 0,
  }));

  const mockStats = {
    totalScans: 0,
    vulnerabilities: { critical: 0, high: 0, medium: 0, low: 0, total: 0 },
    avgRiskScore: 0,
    blockedScans: 0,
    completeScans: 0,
    completionRate: 0,
  };

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen text-red-500">
        Error: {error}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="@container/main flex flex-col gap-2 p-4 lg:p-6">
        <SectionCards
          loading={showSkeleton}
          scanData={showSkeleton ? mockData : scans}
          stats={showSkeleton ? mockStats : stats}
        />
        {showSkeleton ? (
          <>
            {/* ScanJobsMonitor Skeleton */}
            <div className="bg-card rounded-lg border shadow-xs p-6">
              <div className="flex items-center gap-2 mb-4">
                <Skeleton className="h-5 w-5" />
                <Skeleton className="h-6 w-24" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </div>

            {/* VulnerabilityScatterplot Skeleton */}
            <div className="bg-card rounded-lg border shadow-xs p-6">
              <div className="mb-4">
                <Skeleton className="h-6 w-64 mb-2" />
                <Skeleton className="h-4 w-96" />
              </div>
              <div className="mb-4 flex justify-end gap-2">
                <Skeleton className="h-8 w-12" />
                <Skeleton className="h-8 w-12" />
                <Skeleton className="h-8 w-12" />
                <Skeleton className="h-8 w-12" />
              </div>
              <Skeleton className="h-[250px] w-full" />
            </div>

            {/* DataTable Skeleton */}
            <div className="bg-card rounded-lg border shadow-xs p-6">
              <Skeleton className="h-6 w-32 mb-4" />
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-8 gap-4 py-3 items-center"
                  >
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-6 w-12" />
                    <div className="flex gap-1">
                      <Skeleton className="h-5 w-8" />
                      <Skeleton className="h-5 w-8" />
                      <Skeleton className="h-5 w-8" />
                    </div>
                    <Skeleton className="h-4 w-8" />
                    <Skeleton className="h-4 w-12" />
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-6 w-16" />
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            <ScanJobsMonitor />
            <VulnerabilityScatterplot />
            <DataTable data={scans} />
            {state.pagination.hasMore && (
              <div className="flex justify-center mt-4">
                <Button
                  onClick={loadMore}
                  disabled={state.loading}
                  variant="outline"
                  className="flex items-center gap-2"
                >
                  <IconRefresh className="h-4 w-4" />
                  Load More Images
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
