"use client"

import { useScanning } from '@/contexts/ScanningContext';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { IconLoader2, IconCheck, IconX, IconWifi } from '@tabler/icons-react';

interface ScanProgressBarProps {
  requestId?: string;
  className?: string;
  showStatus?: boolean;
  showStep?: boolean;
  showConnection?: boolean;
}

export function ScanProgressBar({ 
  requestId, 
  className, 
  showStatus = true, 
  showStep = true,
  showConnection = false 
}: ScanProgressBarProps) {
  const { getJobByRequestId } = useScanning();
  
  if (!requestId) {
    return null;
  }

  const progressData = getJobByRequestId(requestId);
  if (!progressData) {
    return null;
  }

  const isComplete = progressData.status === 'SUCCESS' || progressData.status === 'FAILED' || progressData.status === 'CANCELLED';

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'RUNNING':
        return <IconLoader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case 'SUCCESS':
        return <IconCheck className="h-4 w-4 text-green-500" />;
      case 'FAILED':
        return <IconX className="h-4 w-4 text-red-500" />;
      case 'CANCELLED':
        return <IconX className="h-4 w-4 text-gray-500" />;
      default:
        return <IconLoader2 className="h-4 w-4 animate-spin text-gray-400" />;
    }
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'RUNNING':
        return 'text-blue-600';
      case 'SUCCESS':
        return 'text-green-600';
      case 'FAILED':
        return 'text-red-600';
      case 'CANCELLED':
        return 'text-gray-600';
      default:
        return 'text-gray-500';
    }
  };

  const getProgressColor = (status?: string) => {
    switch (status) {
      case 'SUCCESS':
        return 'bg-green-500';
      case 'FAILED':
        return 'bg-red-500';
      case 'CANCELLED':
        return 'bg-gray-500';
      default:
        return 'bg-blue-500';
    }
  };

  const progress = progressData.progress || 0;
  const status = progressData.status;
  const step = progressData.step;

  return (
    <div className={cn("space-y-2", className)}>
      {/* Connection status (optional) */}
      {showConnection && (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <IconWifi className="h-3 w-3 text-green-500" />
          <span>Connected</span>
        </div>
      )}

      {/* Progress bar */}
      <div className="space-y-1">
        <Progress 
          value={progress} 
          className="h-2 transition-all duration-300"
          indicatorClassName={getProgressColor(status)}
        />
        
        <div className="flex justify-between items-center text-xs">
          <span className="text-gray-600">
            {progress.toFixed(0)}%
          </span>
          {showStatus && (
            <div className="flex items-center gap-1">
              {getStatusIcon(status)}
              <span className={cn("font-medium", getStatusColor(status))}>
                {status || 'Waiting...'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Current step (optional) */}
      {showStep && step && (
        <div className="text-xs text-gray-600 truncate">
          {step}
        </div>
      )}

      {/* Error message */}
      {progressData.error && (
        <div className="text-xs text-red-600 bg-red-50 p-2 rounded border border-red-200">
          <strong>Error:</strong> {progressData.error}
        </div>
      )}
    </div>
  );
}

// Compact version for inline use
export function ScanProgressBarCompact({ requestId, className }: Pick<ScanProgressBarProps, 'requestId' | 'className'>) {
  return (
    <ScanProgressBar
      requestId={requestId}
      className={className}
      showStatus={false}
      showStep={false}
      showConnection={false}
    />
  );
}

// Full version with all details
export function ScanProgressBarDetailed({ requestId, className }: Pick<ScanProgressBarProps, 'requestId' | 'className'>) {
  return (
    <ScanProgressBar
      requestId={requestId}
      className={className}
      showStatus={true}
      showStep={true}
      showConnection={true}
    />
  );
}