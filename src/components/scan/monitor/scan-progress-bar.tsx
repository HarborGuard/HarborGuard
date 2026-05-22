"use client"

import { useScanning } from '@/contexts/ScanningContext';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { Loader2, Check, X, Wifi } from 'lucide-react';

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
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case 'SUCCESS':
        return <Check className="h-4 w-4 text-green-500" />;
      case 'FAILED':
        return <X className="h-4 w-4 text-red-500" />;
      case 'CANCELLED':
        return <X className="h-4 w-4 text-gray-500" />;
      default:
        return <Loader2 className="h-4 w-4 animate-spin text-gray-400" />;
    }
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'RUNNING':
        return 'text-blue-400';
      case 'SUCCESS':
        return 'text-green-400';
      case 'FAILED':
        return 'text-red-400';
      case 'CANCELLED':
        return 'text-muted-foreground/60';
      default:
        return 'text-muted-foreground/40';
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
        <div className="flex items-center gap-2 text-caption uppercase tracking-widest text-muted-foreground/50">
          <Wifi className="h-3 w-3 text-green-500" />
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
        
        <div className="flex justify-between items-center text-caption uppercase tracking-widest">
          <span className="text-muted-foreground/60">
            {progress.toFixed(0)}%
          </span>
          {showStatus && (
            <div className="flex items-center gap-1">
              {getStatusIcon(status)}
              <span className={cn(getStatusColor(status))}>
                {status || 'Waiting...'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Current step (optional) */}
      {showStep && step && (
        <div className="text-caption uppercase tracking-widest text-muted-foreground/50 truncate">
          {step}
        </div>
      )}

      {/* Error message */}
      {progressData.error && (
        <div className="text-caption uppercase tracking-widest text-red-400 bg-red-950/20 p-2 border border-red-500/20">
          Error: {progressData.error}
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