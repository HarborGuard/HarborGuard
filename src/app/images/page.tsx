"use client";

import { AppSidebar } from "@/components/app-sidebar";
import { DataTable } from "@/components/data-table";
import { SiteHeader } from "@/components/site-header";
import { ScanJobsMonitor } from "@/components/scan-jobs-monitor";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useScans } from "@/hooks/useScans";
import { useApp } from "@/contexts/AppContext";
import { FullPageLoading } from "@/components/ui/loading";

export default function ImageRepositoryPage() {
  const { scans, loading } = useScans();
  const { state, setPage } = useApp();
  const breadcrumbs = [{ label: "Dashboard", href: "/" }, { label: "Images" }];

  if (loading) {
    return (
      <FullPageLoading
        message="Loading Image Repository"
        description="Fetching container images and scan results..."
      />
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-2 overflow-auto">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
          <ScanJobsMonitor />
          <DataTable 
            data={scans} 
            isFullPage={true}
            serverSidePagination={true}
            currentPage={state.pagination.currentPage}
            totalPages={state.pagination.totalPages}
            onPageChange={setPage}
          />
        </div>
      </div>
    </div>
  );
}
