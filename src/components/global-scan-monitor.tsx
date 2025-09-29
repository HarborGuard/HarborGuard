"use client";

import { useState, useEffect, useRef } from "react";
import { ScanProgressBarDetailed } from "@/components/scan-progress-bar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { IconRefresh, IconEye, IconX } from "@tabler/icons-react";
import { useScanning } from "@/providers/ScanningProvider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export function GlobalScanMonitor() {
  const { runningJobs, completedJobs, queuedScans, refreshJobs } = useScanning();

  const [isOpen, setIsOpen] = useState(false);
  const toastIdRef = useRef<string | number | undefined>(undefined);

  // Component mount logging
  useEffect(() => {
    console.log("GlobalScanMonitor: Component mounted");
    console.log("GlobalScanMonitor: Initial runningJobs =", runningJobs);
  }, []);

  const cancelScan = async (requestId: string) => {
    try {
      const response = await fetch(`/api/scans/cancel/${requestId}`, {
        method: "POST",
      });
      if (response.ok) {
        await refreshJobs();
      }
    } catch (error) {
      console.error("Error cancelling scan:", error);
    }
  };

  // Only show recent failed/cancelled jobs
  const recentJobs = completedJobs.filter((job) => {
    if (job.status === "SUCCESS") {
      return false;
    }

    const jobTime = new Date(job.lastUpdate).getTime();
    const timeDiff = Date.now() - jobTime;
    return (
      timeDiff < 30000 &&
      (job.status === "FAILED" || job.status === "CANCELLED")
    );
  });

  const totalActiveJobs = runningJobs.length;
  const totalQueuedJobs = queuedScans ? queuedScans.length : 0;
  const totalPendingWork = totalActiveJobs + totalQueuedJobs;

  // Track previous job count to detect changes
  const prevJobCountRef = useRef(0);
  const prevQueuedCountRef = useRef(0);

  // Show/hide toast based on running jobs
  useEffect(() => {
    console.log(
      "GlobalScanMonitor: Effect running - totalActiveJobs =",
      totalActiveJobs
    );
    console.log(
      "GlobalScanMonitor: Previous job count =",
      prevJobCountRef.current
    );
    console.log("GlobalScanMonitor: Current toastIdRef =", toastIdRef.current);
    console.log("GlobalScanMonitor: runningJobs details =", runningJobs);

    // Check if jobs increased (new scan started) or queue changed
    if (totalPendingWork > 0 && (totalActiveJobs > prevJobCountRef.current || totalQueuedJobs !== prevQueuedCountRef.current)) {
      console.log("GlobalScanMonitor: NEW SCAN/QUEUE CHANGE DETECTED! Creating toast...");

      // Dismiss any existing toast first
      if (toastIdRef.current) {
        toast.dismiss(toastIdRef.current);
        toastIdRef.current = undefined;
      }

      // Create message based on what's active
      let message = '';
      if (totalActiveJobs > 0 && totalQueuedJobs > 0) {
        message = `${totalActiveJobs} Running, ${totalQueuedJobs} Queued - Click to view`;
      } else if (totalActiveJobs > 0) {
        message = `${totalActiveJobs} ${totalActiveJobs === 1 ? "Scan" : "Scans"} Running - Click to view`;
      } else {
        message = `${totalQueuedJobs} ${totalQueuedJobs === 1 ? "Scan" : "Scans"} Queued - Click to view`;
      }
      const id = `scan-toast-${Date.now()}`;

      // Small delay to ensure DOM is ready
      setTimeout(() => {
        // Use regular toast instead of toast.loading
        toastIdRef.current = toast(
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
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
            <span>{message}</span>
          </div>,
          {
            duration: Infinity,
            position: "bottom-right",
            id: id,
          }
        );

        console.log(
          "GlobalScanMonitor: Toast CREATED with ID =",
          toastIdRef.current
        );

        // Add click handler
        setTimeout(() => {
          const toasts = document.querySelectorAll("[data-sonner-toast]");
          const lastToast = toasts[toasts.length - 1] as HTMLElement;
          if (lastToast) {
            lastToast.style.cursor = "pointer";
            lastToast.onclick = () => {
              console.log("Toast clicked, opening dialog");
              setIsOpen(true);
              if (toastIdRef.current) {
                toast.dismiss(toastIdRef.current);
                toastIdRef.current = undefined;
              }
            };
            console.log("GlobalScanMonitor: Click handler attached to toast");
          }
        }, 300);
      }, 50);
    } else if (totalPendingWork > 0 && !toastIdRef.current) {
      // Jobs exist but no toast (page reload scenario)
      console.log("GlobalScanMonitor: Jobs exist on mount, creating toast");

      let message = '';
      if (totalActiveJobs > 0 && totalQueuedJobs > 0) {
        message = `${totalActiveJobs} Running, ${totalQueuedJobs} Queued - Click to view`;
      } else if (totalActiveJobs > 0) {
        message = `${totalActiveJobs} ${totalActiveJobs === 1 ? "Scan" : "Scans"} Running - Click to view`;
      } else {
        message = `${totalQueuedJobs} ${totalQueuedJobs === 1 ? "Scan" : "Scans"} Queued - Click to view`;
      }
      toastIdRef.current = toast(
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            cursor: "pointer",
          }}
          onClick={() => {
            setIsOpen(true);
          }}
        >
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
          <span>{message}</span>
        </div>,
        {
          duration: 90000,
          position: "bottom-right",
        }
      );
    } else if (totalPendingWork === 0 && toastIdRef.current) {
      console.log("GlobalScanMonitor: No active or queued jobs, dismissing toast");
      toast.dismiss(toastIdRef.current);
      toastIdRef.current = undefined;
    }

    // Update previous counts
    prevJobCountRef.current = totalActiveJobs;
    prevQueuedCountRef.current = totalQueuedJobs;
  }, [totalActiveJobs, totalQueuedJobs, runningJobs, queuedScans]);

  return (
    <>
      {/* Dialog with scan details */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>Active Scans</DialogTitle>
            </div>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            {/* Summary Stats */}
            <div className="flex gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 bg-blue-500 rounded-full animate-pulse" />
                <span>Running: {runningJobs.length}</span>
              </div>
              {queuedScans && queuedScans.length > 0 && (
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 bg-yellow-500 rounded-full" />
                  <span>Queued: {queuedScans.length}</span>
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
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Active Scans ({runningJobs.length})
                </h4>
                {runningJobs.map((job) => (
                  <div
                    key={job.requestId}
                    className="p-3 border rounded-lg space-y-2 bg-card"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">
                          {job.requestId.slice(-8)}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {job.imageName || job.imageId}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            window.open(`/scans/${job.scanId}`, "_blank")
                          }
                        >
                          <IconEye className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => cancelScan(job.requestId)}
                        >
                          <IconX className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>

                    <ScanProgressBarDetailed
                      requestId={job.requestId}
                      className="w-full"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Queued Scans */}
            {queuedScans && queuedScans.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <svg className="h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-50" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M12 6v6l4 2" />
                  </svg>
                  Queued Scans ({queuedScans.length})
                </h4>
                {queuedScans.map((scan: any) => (
                  <div
                    key={scan.requestId}
                    className="p-3 border rounded-lg space-y-2 bg-card opacity-60"
                  >
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

                    <div className="w-full bg-secondary rounded-full h-2">
                      <div className="bg-yellow-500 h-2 rounded-full w-0" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Recent Completed/Failed Scans */}
            {recentJobs.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground">
                  Recent ({recentJobs.length})
                </h4>
                {recentJobs.map((job) => (
                  <div
                    key={job.requestId}
                    className="p-3 border rounded-lg space-y-2 opacity-75"
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
                          {job.status}
                        </span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          window.open(`/scans/${job.scanId}`, "_blank")
                        }
                      >
                        <IconEye className="h-3 w-3" />
                      </Button>
                    </div>

                    <ScanProgressBarDetailed
                      requestId={job.requestId}
                      className="w-full"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
