"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Activity,
  CheckCircle,
  XCircle,
  Clock,
} from "lucide-react";
import type { BulkScanJob } from "@/hooks/useBulkScan";

interface BulkScanJobsListProps {
  jobs: BulkScanJob[];
  jobsLoading: boolean;
  onRefresh: () => void;
}

function getStatusIcon(status: string) {
  switch (status) {
    case "RUNNING":
      return <Activity className="h-4 w-4 text-accent animate-pulse" />;
    case "COMPLETED":
      return <CheckCircle className="h-4 w-4 text-green-400" />;
    case "FAILED":
      return <XCircle className="h-4 w-4 text-red-400" />;
    default:
      return <Clock className="h-4 w-4 text-muted-foreground/40" />;
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case "RUNNING":
      return "bg-accent/20 text-accent border-accent/30 rounded-full";
    case "COMPLETED":
      return "bg-green-900/30 text-green-400 border-green-500/30 rounded-full";
    case "FAILED":
      return "bg-red-900/30 text-red-400 border-red-500/30 rounded-full";
    default:
      return "bg-white/5 text-muted-foreground border-white/10 rounded-full";
  }
}

export function BulkScanJobsList({
  jobs,
  jobsLoading,
  onRefresh,
}: BulkScanJobsListProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-body-sm font-medium uppercase tracking-caps text-muted-foreground/60">Active Bulk Scan Jobs</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={jobsLoading}
          className="rounded-none border-white/10 hover:bg-white/5 uppercase tracking-widest text-caption"
        >
          {jobsLoading ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      {jobs.length === 0 ? (
        <Card className="bg-surface-1 border-white/10 rounded-none">
          <CardContent className="flex flex-col items-center justify-center py-8">
            <Activity className="h-10 w-10 text-muted-foreground/20 mb-4" />
            <h3 className="text-body-sm font-medium uppercase tracking-caps text-muted-foreground/60">No Active Jobs</h3>
            <p className="text-caption uppercase tracking-widest text-muted-foreground/40 text-center mt-1">
              Start a new bulk scan to see job progress here
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {jobs.map((job) => (
            <Card key={job.id} className="bg-surface-1 border-white/10 rounded-none">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-body-sm uppercase tracking-caps text-foreground">
                    {job.name || `Bulk Scan ${job.id.slice(0, 8)}`}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {getStatusIcon(job.status)}
                    <Badge className={`${getStatusColor(job.status)} uppercase tracking-widest text-caption`}>
                      {job.status}
                    </Badge>
                  </div>
                </div>
                <CardDescription className="text-caption uppercase tracking-widest text-muted-foreground/40">
                  {job.totalImages} images • Started{" "}
                  {new Date(job.createdAt).toLocaleDateString()}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {job.summary && job.status === "RUNNING" && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-caption uppercase tracking-widest text-muted-foreground/50">
                      <span>Progress</span>
                      <span>
                        {job.summary.completed + job.summary.failed} /{" "}
                        {job.totalImages}
                      </span>
                    </div>
                    <Progress
                      value={
                        ((job.summary.completed + job.summary.failed) /
                          job.totalImages) *
                        100
                      }
                      className="w-full"
                    />
                    <div className="flex gap-4 text-caption text-muted-foreground/40 uppercase tracking-widest">
                      <span>{job.summary.completed} completed</span>
                      <span>{job.summary.failed} failed</span>
                      <span>{job.summary.running} running</span>
                    </div>
                  </div>
                )}

                {job.status === "FAILED" && job.errorMessage && (
                  <div className="text-body-sm text-red-400 bg-red-950/20 border border-red-500/20 p-2">
                    {job.errorMessage}
                  </div>
                )}

                {job.status === "COMPLETED" && (
                  <div className="text-caption text-green-400 uppercase tracking-widest">
                    Completed {job.completedAt && new Date(job.completedAt).toLocaleDateString()}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
