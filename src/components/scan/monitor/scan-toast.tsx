"use client"

import React from 'react';
import { cn } from '@/lib/utils';

interface ScanToastProps {
  runningCount: number;
  queuedCount: number;
  onClick: () => void;
  className?: string;
}

/**
 * Custom toast component for scan notifications
 * Displays running and queued scan counts with a loading spinner
 */
export function ScanToast({
  runningCount,
  queuedCount,
  onClick,
  className
}: ScanToastProps) {
  const totalCount = runningCount + queuedCount;

  if (totalCount === 0) {
    return null;
  }

  // Build message based on counts
  let message = '';
  if (runningCount > 0 && queuedCount > 0) {
    message = `${runningCount} Running, ${queuedCount} Queued`;
  } else if (runningCount > 0) {
    message = `${runningCount} ${runningCount === 1 ? 'Scan' : 'Scans'} Running`;
  } else {
    message = `${queuedCount} ${queuedCount === 1 ? 'Scan' : 'Scans'} Queued`;
  }

  return (
    <button
      onClick={onClick}
      className={cn(
        "min-w-75 flex items-center gap-2 px-4 py-2",
        "bg-background border rounded-lg shadow-lg",
        "hover:bg-accent transition-colors",
        "cursor-pointer select-none",
        "animate-in slide-in-from-bottom-5",
        className
      )}
      aria-label={`${message} - Click to view details`}
    >
      {/* Loading spinner */}
      <svg
        className="animate-spin h-4 w-4 text-primary"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
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

      {/* Message */}
      <span className="text-sm font-medium">
        {message}
      </span>

      {/* Click hint */}
      <span className="text-xs text-muted-foreground ml-1">
        Click to view
      </span>
    </button>
  );
}