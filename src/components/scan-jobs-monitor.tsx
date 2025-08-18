"use client"

import { ScanProgressBarDetailed } from '@/components/scan-progress-bar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { IconRefresh, IconEye, IconX } from '@tabler/icons-react';
import { Badge } from '@/components/ui/badge';
import { useScanning } from '@/providers/ScanningProvider';

export function ScanJobsMonitor() {
  const { 
    runningJobs, 
    completedJobs, 
    refreshJobs 
  } = useScanning();

  const cancelScan = async (requestId: string) => {
    try {
      const response = await fetch(`/api/scans/cancel/${requestId}`, {
        method: 'POST'
      });
      if (response.ok) {
        await refreshJobs(); // Refresh the list
      }
    } catch (error) {
      console.error('Error cancelling scan:', error);
    }
  };

  // Only show recent failed/cancelled jobs (not successful ones)
  const recentJobs = completedJobs.filter(job => {
    // Don't show successful scans in recent
    if (job.status === 'SUCCESS') {
      return false;
    }
    
    // Show failed/cancelled jobs for 30 seconds
    const jobTime = new Date(job.lastUpdate).getTime();
    const timeDiff = Date.now() - jobTime;
    return timeDiff < 30000 && (job.status === 'FAILED' || job.status === 'CANCELLED');
  });

  const totalJobs = runningJobs.length + recentJobs.length;

  if (totalJobs === 0) {
    return null; // Don't show anything if no jobs
  }

  return (
            <div className="*:data-[slot=card]:bg-card gap-4 px-4 my-4 *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">

    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-2">
          <CardTitle className="text-sm font-medium">Active Scans</CardTitle>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={refreshJobs}
        >
          <IconRefresh className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Running Scans */}
        {runningJobs.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground">
              Running ({runningJobs.length})
            </h4>
            {runningJobs.map((job) => (
              <div
                key={job.requestId}
                className="p-3 border rounded-lg space-y-2 bg-white"
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
                      onClick={() => window.open(`/scans/${job.scanId}`, '_blank')}
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
                        job.status === 'SUCCESS' 
                          ? 'default' 
                          : job.status === 'FAILED' 
                          ? 'destructive' 
                          : 'secondary'
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
                    onClick={() => window.open(`/scans/${job.scanId}`, '_blank')}
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
      </CardContent>
    </Card>
    </div>
  );
}

// Compact version for dashboard
export function ScanJobsMonitorCompact() {
  const { runningJobs } = useScanning();

  if (runningJobs.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Active Scans ({runningJobs.length})</h4>
      </div>
      {runningJobs.map((job) => (
        <div key={job.requestId} className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {job.requestId.slice(-8)}
            </span>
            <Badge variant="secondary" className="text-xs">
              {job.status}
            </Badge>
          </div>
          <ScanProgressBarDetailed 
            requestId={job.requestId}
            className="w-full"
          />
        </div>
      ))}
    </div>
  );
}