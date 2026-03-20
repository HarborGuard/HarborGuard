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
      return <Activity className="h-4 w-4 text-blue-500 animate-pulse" />;
    case "COMPLETED":
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case "FAILED":
      return <XCircle className="h-4 w-4 text-red-500" />;
    default:
      return <Clock className="h-4 w-4 text-gray-500" />;
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case "RUNNING":
      return "bg-blue-100 text-blue-800";
    case "COMPLETED":
      return "bg-green-100 text-green-800";
    case "FAILED":
      return "bg-red-100 text-red-800";
    default:
      return "bg-gray-100 text-gray-800";
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
        <h3 className="text-lg font-semibold">Active Bulk Scan Jobs</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={jobsLoading}
        >
          {jobsLoading ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      {jobs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-8">
            <Activity className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold">No Active Jobs</h3>
            <p className="text-muted-foreground text-center">
              Start a new bulk scan to see job progress here
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {jobs.map((job) => (
            <Card key={job.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    {job.name || `Bulk Scan ${job.id.slice(0, 8)}`}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {getStatusIcon(job.status)}
                    <Badge className={getStatusColor(job.status)}>
                      {job.status}
                    </Badge>
                  </div>
                </div>
                <CardDescription>
                  {job.totalImages} images • Started{" "}
                  {new Date(job.createdAt).toLocaleDateString()}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {job.summary && job.status === "RUNNING" && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
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
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span>✓ {job.summary.completed} completed</span>
                      <span>✗ {job.summary.failed} failed</span>
                      <span>⏳ {job.summary.running} running</span>
                    </div>
                  </div>
                )}

                {job.status === "FAILED" && job.errorMessage && (
                  <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
                    {job.errorMessage}
                  </div>
                )}

                {job.status === "COMPLETED" && (
                  <div className="text-sm text-green-600">
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
