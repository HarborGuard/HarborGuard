"use client"

import React, { createContext, useContext, useEffect, useReducer, useCallback, useRef, useMemo } from 'react';
import { useSSE } from '@/hooks/useSSE';
import { ScanProgressEvent } from '@/lib/scanner/types';
import { ConnectionStatus } from '@/lib/sse-manager';

export interface ScanJob {
  requestId: string;
  scanId: string;
  imageId: string;
  imageName?: string;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLED' | 'QUEUED';
  progress: number;
  step?: string;
  error?: string;
  startTime: string;
  lastUpdate: string;
  queuePosition?: number;
  estimatedWaitTime?: number;
}

interface ScanningState {
  jobs: Map<string, ScanJob>;
  queuedScans: ScanJob[];
  lastFetchTime: number;
  isPolling: boolean;
}

type ScanningAction =
  | { type: 'UPDATE_SCAN_PROGRESS'; payload: ScanProgressEvent }
  | { type: 'ADD_SCAN_JOB'; payload: Omit<ScanJob, 'startTime' | 'lastUpdate'> }
  | { type: 'REMOVE_SCAN_JOB'; payload: string }
  | { type: 'SET_JOBS'; payload: ScanJob[] }
  | { type: 'SET_QUEUED_SCANS'; payload: ScanJob[] }
  | { type: 'CLEAR_COMPLETED_JOBS' }
  | { type: 'AUTO_CLEANUP' }
  | { type: 'SET_POLLING'; payload: boolean };

function scanningReducer(state: ScanningState, action: ScanningAction): ScanningState {
  switch (action.type) {
    case 'UPDATE_SCAN_PROGRESS': {
      const event = action.payload;
      const existingJob = state.jobs.get(event.requestId);

      const updatedJob: ScanJob = {
        requestId: event.requestId,
        scanId: event.scanId,
        imageId: existingJob?.imageId || '',
        imageName: existingJob?.imageName,
        status: event.status,
        progress: event.progress,
        step: event.step,
        error: event.error,
        startTime: existingJob?.startTime || event.timestamp,
        lastUpdate: event.timestamp
      };

      const newJobs = new Map(state.jobs);
      newJobs.set(event.requestId, updatedJob);

      return { ...state, jobs: newJobs };
    }

    case 'ADD_SCAN_JOB': {
      const newJob: ScanJob = {
        ...action.payload,
        startTime: new Date().toISOString(),
        lastUpdate: new Date().toISOString()
      };

      const updatedJobs = new Map(state.jobs);
      updatedJobs.set(newJob.requestId, newJob);

      return { ...state, jobs: updatedJobs };
    }

    case 'REMOVE_SCAN_JOB': {
      const filteredJobs = new Map(state.jobs);
      filteredJobs.delete(action.payload);
      return { ...state, jobs: filteredJobs };
    }

    case 'SET_JOBS': {
      const jobsMap = new Map<string, ScanJob>();
      action.payload.forEach(job => {
        jobsMap.set(job.requestId, job);
      });
      return { ...state, jobs: jobsMap, lastFetchTime: Date.now() };
    }

    case 'SET_QUEUED_SCANS':
      return { ...state, queuedScans: action.payload };

    case 'CLEAR_COMPLETED_JOBS': {
      const activeJobs = new Map<string, ScanJob>();
      state.jobs.forEach((job, requestId) => {
        if (job.status === 'RUNNING') {
          activeJobs.set(requestId, job);
        }
      });
      return { ...state, jobs: activeJobs };
    }

    case 'AUTO_CLEANUP': {
      const currentTime = Date.now();
      const cleanedJobs = new Map<string, ScanJob>();

      state.jobs.forEach((job, requestId) => {
        // Keep running jobs always
        if (job.status === 'RUNNING') {
          cleanedJobs.set(requestId, job);
        }
        // Remove successful jobs after 5 seconds
        else if (job.status === 'SUCCESS') {
          const jobTime = new Date(job.lastUpdate).getTime();
          if (currentTime - jobTime < 5000) {
            cleanedJobs.set(requestId, job);
          }
        }
        // Keep failed/cancelled jobs for 30 seconds
        else if (job.status === 'FAILED' || job.status === 'CANCELLED') {
          const jobTime = new Date(job.lastUpdate).getTime();
          if (currentTime - jobTime < 30000) {
            cleanedJobs.set(requestId, job);
          }
        }
      });

      return { ...state, jobs: cleanedJobs };
    }

    case 'SET_POLLING':
      return { ...state, isPolling: action.payload };

    default:
      return state;
  }
}

interface ScanningContextType {
  // State
  jobs: ScanJob[];
  runningJobs: ScanJob[];
  completedJobs: ScanJob[];
  queuedScans: ScanJob[];

  // Actions
  addScanJob: (job: Omit<ScanJob, 'startTime' | 'lastUpdate'>) => void;
  removeScanJob: (requestId: string) => void;
  refreshJobs: () => Promise<void>;
  clearCompletedJobs: () => void;

  // Utilities
  getJobByRequestId: (requestId: string) => ScanJob | undefined;
  setOnScanComplete: (callback: (job: ScanJob) => void) => void;

  // SSE Management
  subscribeTo: (requestId: string) => void;
  unsubscribeFrom: (requestId: string) => void;
}

const ScanningContext = createContext<ScanningContextType | undefined>(undefined);

export function ScanningProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(scanningReducer, {
    jobs: new Map(),
    queuedScans: [],
    lastFetchTime: 0,
    isPolling: false,
  });

  const onScanCompleteRef = useRef<((job: ScanJob) => void) | null>(null);
  const previousJobsRef = useRef<Map<string, ScanJob>>(new Map());
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Use SSE hook with handlers
  const { connect, disconnect, getActiveConnections } = useSSE({
    onProgress: useCallback((requestId: string, data: ScanProgressEvent) => {
      dispatch({ type: 'UPDATE_SCAN_PROGRESS', payload: data });
    }, []),
    onStatusChange: useCallback((requestId: string, status: ConnectionStatus) => {
      // Log status changes in development
      if (process.env.NODE_ENV === 'development') {
        console.log(`[SSE] ${requestId}: ${status}`);
      }
    }, []),
    onError: useCallback((requestId: string, error: string) => {
      console.error(`[SSE Error] ${requestId}: ${error}`);
    }, []),
  });

  // Subscribe to SSE for a scan
  const subscribeTo = useCallback((requestId: string) => {
    connect(requestId);
  }, [connect]);

  // Unsubscribe from SSE for a scan
  const unsubscribeFrom = useCallback((requestId: string) => {
    disconnect(requestId);
  }, [disconnect]);

  // Monitor for scan completions
  useEffect(() => {
    const currentJobs = state.jobs;
    const previousJobs = previousJobsRef.current;

    // Check for jobs that just became SUCCESS
    currentJobs.forEach((job, requestId) => {
      const previousJob = previousJobs.get(requestId);
      if (job.status === 'SUCCESS' && previousJob && previousJob.status !== 'SUCCESS') {
        // Job just completed successfully
        if (onScanCompleteRef.current) {
          onScanCompleteRef.current(job);
        }
        // Disconnect SSE for completed job after a small delay
        setTimeout(() => {
          disconnect(requestId);
        }, 2000);
      } else if ((job.status === 'FAILED' || job.status === 'CANCELLED') &&
                 previousJob && previousJob.status === 'RUNNING') {
        // Job failed or was cancelled - disconnect SSE
        disconnect(requestId);
      }
    });

    // Update previous jobs reference
    previousJobsRef.current = new Map(currentJobs);
  }, [state.jobs, disconnect]);

  // Fetch jobs from API
  const refreshJobs = useCallback(async () => {
    try {
      const response = await fetch('/api/scans/jobs');
      if (response.ok) {
        const data = await response.json();
        const jobs: ScanJob[] = (data.jobs || []).map((job: any) => ({
          ...job,
          startTime: job.startTime || new Date().toISOString(),
          lastUpdate: new Date().toISOString()
        }));

        const queuedScans: ScanJob[] = (data.queuedScans || []).map((scan: any) => ({
          ...scan,
          status: 'QUEUED' as const,
          progress: 0,
          startTime: new Date().toISOString(),
          lastUpdate: new Date().toISOString()
        }));

        dispatch({ type: 'SET_JOBS', payload: jobs });
        dispatch({ type: 'SET_QUEUED_SCANS', payload: queuedScans });

        // Subscribe to all running jobs
        const runningJobs = jobs.filter(job => job.status === 'RUNNING');
        const activeConnections = getActiveConnections();

        runningJobs.forEach(job => {
          // Only subscribe if not already connected
          if (!activeConnections.includes(job.requestId)) {
            subscribeTo(job.requestId);
          }
        });

        // Disconnect from any jobs that are no longer running
        activeConnections.forEach(requestId => {
          const job = jobs.find(j => j.requestId === requestId);
          if (!job || job.status !== 'RUNNING') {
            disconnect(requestId);
          }
        });
      }
    } catch (error) {
      console.error('Error fetching scan jobs:', error);
    }
  }, [subscribeTo, disconnect, getActiveConnections]);

  // Add scan job
  const addScanJob = useCallback((job: Omit<ScanJob, 'startTime' | 'lastUpdate'>) => {
    dispatch({ type: 'ADD_SCAN_JOB', payload: job });

    // Automatically subscribe to this job's progress
    if (job.status === 'RUNNING') {
      subscribeTo(job.requestId);
    }
  }, [subscribeTo]);

  // Remove scan job
  const removeScanJob = useCallback((requestId: string) => {
    unsubscribeFrom(requestId);
    dispatch({ type: 'REMOVE_SCAN_JOB', payload: requestId });
  }, [unsubscribeFrom]);

  // Clear completed jobs
  const clearCompletedJobs = useCallback(() => {
    dispatch({ type: 'CLEAR_COMPLETED_JOBS' });
  }, []);

  // Get job by request ID
  const getJobByRequestId = useCallback((requestId: string) => {
    return state.jobs.get(requestId);
  }, [state.jobs]);

  // Set scan complete callback
  const setOnScanComplete = useCallback((callback: (job: ScanJob) => void) => {
    onScanCompleteRef.current = callback;
  }, []);

  // Adaptive polling based on active scans
  useEffect(() => {
    const hasRunningJobs = Array.from(state.jobs.values()).some(job => job.status === 'RUNNING');
    const hasQueuedJobs = state.queuedScans.length > 0;
    const shouldPoll = hasRunningJobs || hasQueuedJobs;

    // Clear existing interval
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }

    if (shouldPoll) {
      // Fast polling when active scans
      pollingIntervalRef.current = setInterval(refreshJobs, 3000);
      dispatch({ type: 'SET_POLLING', payload: true });
    } else {
      // Slow polling when idle
      pollingIntervalRef.current = setInterval(refreshJobs, 30000);
      dispatch({ type: 'SET_POLLING', payload: false });
    }

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [state.jobs, state.queuedScans, refreshJobs]);

  // Initial fetch
  useEffect(() => {
    refreshJobs();
  }, [refreshJobs]);

  // Auto-cleanup completed jobs
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      dispatch({ type: 'AUTO_CLEANUP' });
    }, 5000); // Check every 5 seconds

    return () => clearInterval(cleanupInterval);
  }, []);

  // Memoized derived state
  const jobs = useMemo(() => Array.from(state.jobs.values()), [state.jobs]);
  const runningJobs = useMemo(() => jobs.filter(job => job.status === 'RUNNING'), [jobs]);
  const completedJobs = useMemo(() => jobs.filter(job => job.status !== 'RUNNING'), [jobs]);

  const contextValue: ScanningContextType = useMemo(() => ({
    jobs,
    runningJobs,
    completedJobs,
    queuedScans: state.queuedScans,
    addScanJob,
    removeScanJob,
    refreshJobs,
    clearCompletedJobs,
    getJobByRequestId,
    setOnScanComplete,
    subscribeTo,
    unsubscribeFrom,
  }), [
    jobs,
    runningJobs,
    completedJobs,
    state.queuedScans,
    addScanJob,
    removeScanJob,
    refreshJobs,
    clearCompletedJobs,
    getJobByRequestId,
    setOnScanComplete,
    subscribeTo,
    unsubscribeFrom,
  ]);

  return (
    <ScanningContext.Provider value={contextValue}>
      {children}
    </ScanningContext.Provider>
  );
}

export function useScanning() {
  const context = useContext(ScanningContext);
  if (context === undefined) {
    throw new Error('useScanning must be used within a ScanningProvider');
  }
  return context;
}