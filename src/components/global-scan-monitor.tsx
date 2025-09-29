"use client";

import { useState, useEffect, useMemo } from "react";
import { ScanProgressBarDetailed } from "@/components/scan-progress-bar";
import { ScanToast } from "@/components/scan-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { IconEye, IconX } from "@tabler/icons-react";
import { useScanning } from "@/providers/ScanningProvider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function GlobalScanMonitor() {
  const { runningJobs, completedJobs, queuedScans, refreshJobs } = useScanning();
  const [isOpen, setIsOpen] = useState(false);
  const [showToast, setShowToast] = useState(false);

  // Filter recent completed jobs (failed/cancelled within last 30s)
  const recentJobs = useMemo(() => {
    return completedJobs.filter((job) => {
      if (job.status === "SUCCESS") return false;

      const jobTime = new Date(job.lastUpdate).getTime();
      const timeDiff = Date.now() - jobTime;
      return timeDiff < 30000 && (job.status === "FAILED" || job.status === "CANCELLED");
    });
  }, [completedJobs]);

  const totalActiveJobs = runningJobs.length;
  const totalQueuedJobs = queuedScans?.length || 0;
  const hasPendingWork = totalActiveJobs > 0 || totalQueuedJobs > 0;

  // Control toast visibility
  useEffect(() => {
    setShowToast(hasPendingWork);
  }, [hasPendingWork]);

  // Handle scan cancellation
  const cancelScan = async (requestId: string) => {
    try {
      const response = await fetch(`/api/scans/cancel/${requestId}`, {
        method: "POST",
      });
      if (response.ok) {
        await refreshJobs();
        toast.success("Scan cancelled");
      } else {
        toast.error("Failed to cancel scan");
      }
    } catch (error) {
      console.error("Error cancelling scan:", error);
      toast.error("Failed to cancel scan");
    }
  };

  // Handle toast click
  const handleToastClick = () => {
    setIsOpen(true);
    // Use sonner's dismiss method to remove any existing toasts
    toast.dismiss();
  };

  return (
    <>
      {/* Custom floating toast */}
      {showToast && (
        <div className="fixed bottom-4 right-4 z-50">
          <ScanToast
            runningCount={totalActiveJobs}
            queuedCount={totalQueuedJobs}
            onClick={handleToastClick}
          />
        </div>
      )}

      {/* Dialog with scan details */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Scan Activity</DialogTitle>
          </DialogHeader>

          <div className="space-y-6 mt-4">
            {/* Summary Stats */}
            <div className="flex gap-4 text-sm">
              {totalActiveJobs > 0 && (
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 bg-blue-500 rounded-full animate-pulse" />
                  <span>Running: {totalActiveJobs}</span>
                </div>
              )}
              {totalQueuedJobs > 0 && (
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 bg-yellow-500 rounded-full" />
                  <span>Queued: {totalQueuedJobs}</span>
                </div>
              )}
              {recentJobs.length > 0 && (
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 bg-gray-400 rounded-full" />
                  <span>Recent: {recentJobs.length}</span>
                </div>
              )}
            </div>

            {/* Running Scans */}
            {runningJobs.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Running Scans
                </h4>
                {runningJobs.map((job) => (
                  <ScanJobCard
                    key={job.requestId}
                    job={job}
                    onCancel={cancelScan}
                    variant="running"
                  />
                ))}
              </div>
            )}

            {/* Queued Scans */}
            {queuedScans && queuedScans.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <svg className="h-4 w-4" viewBox="0 0 24 24">
                    <circle
                      className="opacity-50"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="2"
                      fill="none"
                    />
                    <path className="opacity-75" fill="currentColor" d="M12 6v6l4 2" />
                  </svg>
                  Queued Scans
                </h4>
                {queuedScans.map((scan) => (
                  <QueuedScanCard
                    key={scan.requestId}
                    scan={scan}
                  />
                ))}
              </div>
            )}

            {/* Recent Completed/Failed Scans */}
            {recentJobs.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground">
                  Recent Activity
                </h4>
                {recentJobs.map((job) => (
                  <ScanJobCard
                    key={job.requestId}
                    job={job}
                    variant="completed"
                  />
                ))}
              </div>
            )}

            {/* Empty state */}
            {totalActiveJobs === 0 && totalQueuedJobs === 0 && recentJobs.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <p>No active scans at the moment</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Card component for displaying scan job details
 */
interface ScanJobCardProps {
  job: any;
  onCancel?: (requestId: string) => void;
  variant?: "running" | "completed";
}

function ScanJobCard({ job, onCancel, variant = "running" }: ScanJobCardProps) {
  const isRunning = variant === "running";

  return (
    <div
      className={cn(
        "p-3 border rounded-lg space-y-2 bg-card",
        !isRunning && "opacity-75"
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge
            variant={
              job.status === "SUCCESS"
                ? "default"
                : job.status === "FAILED"
                ? "destructive"
                : "secondary"
            }
          >
            {job.requestId.slice(-8)}
          </Badge>
          <span className="text-sm text-muted-foreground">
            {job.imageName || job.imageId}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {job.scanId && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.open(`/scans/${job.scanId}`, "_blank")}
              title="View scan details"
            >
              <IconEye className="h-3 w-3" />
            </Button>
          )}
          {isRunning && onCancel && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onCancel(job.requestId)}
              title="Cancel scan"
            >
              <IconX className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {isRunning && (
        <ScanProgressBarDetailed
          requestId={job.requestId}
          className="w-full"
        />
      )}

      {!isRunning && (
        <div className="text-xs text-muted-foreground">
          Status: {job.status}
        </div>
      )}
    </div>
  );
}

/**
 * Card component for queued scans
 */
interface QueuedScanCardProps {
  scan: any;
}

function QueuedScanCard({ scan }: QueuedScanCardProps) {
  return (
    <div className="p-3 border rounded-lg space-y-2 bg-card opacity-60">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="outline">
            {scan.requestId.slice(-8)}
          </Badge>
          <span className="text-sm text-muted-foreground">
            {scan.imageName || scan.imageId}
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {scan.queuePosition && (
            <span>Position: #{scan.queuePosition}</span>
          )}
          {scan.estimatedWaitTime && (
            <span>~{Math.ceil(scan.estimatedWaitTime / 60)}min wait</span>
          )}
        </div>
      </div>

      <div className="w-full bg-secondary rounded-full h-1.5">
        <div className="bg-yellow-500/50 h-1.5 rounded-full animate-pulse" style={{ width: '25%' }} />
      </div>
    </div>
  );
}