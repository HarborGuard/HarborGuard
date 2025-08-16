"use client"

import { useScanning } from '@/providers/ScanningProvider';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { IconCircleCheckFilled, IconLoader } from '@tabler/icons-react';

interface ImageStatusCellProps {
  imageName: string;
  imageId?: string;
  status: string;
}

export function ImageStatusCell({ imageName: _imageName, imageId, status }: ImageStatusCellProps) {
  const { runningJobs } = useScanning();
  
  // Check if there's a running scan for this image
  const runningJob = runningJobs.find(job => {
    // Only match if imageId is provided and matches exactly
    // This should be the most reliable since imageId should be unique
    if (imageId && imageId === job.imageId) {
      return true;
    }
    
    return false;
  });

  // If there's a running scan, show progress bar instead of status badge
  if (runningJob) {
    return (
      <div className="w-32 space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Scanning</span>
          <span className="font-mono">{runningJob.progress}%</span>
        </div>
        <Progress 
          value={runningJob.progress} 
          className="h-2"
        />
        {runningJob.step && (
          <div className="text-xs text-muted-foreground truncate">
            {runningJob.step}
          </div>
        )}
      </div>
    );
  }

  // Otherwise show the regular status badge
  return (
    <Badge variant="outline" className="text-muted-foreground px-1.5">
      {status === "Complete" ? (
        <IconCircleCheckFilled className="fill-green-500 dark:fill-green-400" />
      ) : (
        <IconLoader />
      )}
      {status}
    </Badge>
  );
}