"use client"

import React, { createContext, useContext, useEffect, useReducer, useCallback, useRef } from 'react';
import { SSEClient, ConnectionStatus, ScanProgressEvent } from '@/lib/sse-client';

export interface ScanJob {
  requestId: string;
  scanId: string;
  imageId: string;
  imageName?: string;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';
  progress: number;
  step?: string;
  error?: string;
  startTime: string;
  lastUpdate: string;
}

interface ScanningState {
  jobs: Map<string, ScanJob>;
  sseClients: Map<string, SSEClient>;
}

type ScanningAction =
  | { type: 'UPDATE_SCAN_PROGRESS'; payload: ScanProgressEvent }
  | { type: 'ADD_SCAN_JOB'; payload: Omit<ScanJob, 'startTime' | 'lastUpdate'> }
  | { type: 'REMOVE_SCAN_JOB'; payload: string }
  | { type: 'SET_JOBS'; payload: ScanJob[] }
  | { type: 'CLEAR_COMPLETED_JOBS' }
  | { type: 'AUTO_CLEANUP_COMPLETED' }
  | { type: 'ADD_SSE_CLIENT'; payload: { requestId: string; client: SSEClient } }
  | { type: 'REMOVE_SSE_CLIENT'; payload: string };

function scanningReducer(state: ScanningState, action: ScanningAction): ScanningState {
  switch (action.type) {
    case 'ADD_SSE_CLIENT':
      const newClients = new Map(state.sseClients);
      newClients.set(action.payload.requestId, action.payload.client);
      return { ...state, sseClients: newClients };

    case 'REMOVE_SSE_CLIENT':
      const filteredClients = new Map(state.sseClients);
      const client = filteredClients.get(action.payload);
      if (client) {
        client.disconnect();
        filteredClients.delete(action.payload);
      }
      return { ...state, sseClients: filteredClients };

    case 'UPDATE_SCAN_PROGRESS':
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
      
      // For successful scans, remove them after a brief delay to allow UI to update
      if (event.status === 'SUCCESS') {
        newJobs.set(event.requestId, updatedJob);
        // Set timeout to remove successful scan after 3 seconds
        setTimeout(() => {
          // This will be handled by the AUTO_CLEANUP_COMPLETED action
        }, 3000);
      } else {
        newJobs.set(event.requestId, updatedJob);
      }

      return { ...state, jobs: newJobs };

    case 'ADD_SCAN_JOB':
      const newJob: ScanJob = {
        ...action.payload,
        startTime: new Date().toISOString(),
        lastUpdate: new Date().toISOString()
      };

      const updatedJobs = new Map(state.jobs);
      updatedJobs.set(newJob.requestId, newJob);

      return { ...state, jobs: updatedJobs };

    case 'REMOVE_SCAN_JOB':
      const filteredJobs = new Map(state.jobs);
      filteredJobs.delete(action.payload);
      return { ...state, jobs: filteredJobs };

    case 'SET_JOBS':
      const jobsMap = new Map<string, ScanJob>();
      action.payload.forEach(job => {
        jobsMap.set(job.requestId, job);
      });
      return { ...state, jobs: jobsMap };

    case 'CLEAR_COMPLETED_JOBS':
      const activeJobs = new Map<string, ScanJob>();
      state.jobs.forEach((job, requestId) => {
        if (job.status === 'RUNNING') {
          activeJobs.set(requestId, job);
        }
      });
      return { ...state, jobs: activeJobs };

    case 'AUTO_CLEANUP_COMPLETED':
      const currentTime = Date.now();
      const cleanedJobs = new Map<string, ScanJob>();
      
      state.jobs.forEach((job, requestId) => {
        // Keep running jobs
        if (job.status === 'RUNNING') {
          cleanedJobs.set(requestId, job);
        } else if (job.status === 'SUCCESS') {
          // Remove successful jobs immediately
          return;
        } else if (job.status === 'FAILED' || job.status === 'CANCELLED') {
          // Keep failed/cancelled jobs for 30 seconds
          const jobTime = new Date(job.lastUpdate).getTime();
          const timeDiff = currentTime - jobTime;
          if (timeDiff < 30000) {
            cleanedJobs.set(requestId, job);
          }
        }
      });
      
      return { ...state, jobs: cleanedJobs };

    default:
      return state;
  }
}

interface ScanningContextType {
  jobs: ScanJob[];
  runningJobs: ScanJob[];
  completedJobs: ScanJob[];
  subscribeTo: (requestId: string) => void;
  unsubscribeFrom: (requestId: string) => void;
  addScanJob: (job: Omit<ScanJob, 'startTime' | 'lastUpdate'>) => void;
  removeScanJob: (requestId: string) => void;
  refreshJobs: () => Promise<void>;
  clearCompletedJobs: () => void;
  getJobByRequestId: (requestId: string) => ScanJob | undefined;
  setOnScanComplete: (callback: (job: ScanJob) => void) => void;
}

const ScanningContext = createContext<ScanningContextType | undefined>(undefined);

export function ScanningProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(scanningReducer, {
    jobs: new Map(),
    sseClients: new Map()
  });

  const onScanCompleteRef = useRef<((job: ScanJob) => void) | null>(null);
  const previousJobsRef = useRef<Map<string, ScanJob>>(new Map());

  // Monitor for scan completions
  useEffect(() => {
    const currentJobs = state.jobs;
    const previousJobs = previousJobsRef.current;

    // Check for jobs that just became SUCCESS
    currentJobs.forEach((job, requestId) => {
      const previousJob = previousJobs.get(requestId);
      if (job.status === 'SUCCESS' && previousJob && previousJob.status !== 'SUCCESS') {
        // This job just completed successfully
        if (onScanCompleteRef.current) {
          console.log(`Scan completed successfully: ${job.scanId}`);
          onScanCompleteRef.current(job);
        }
      }
    });

    // Update previous jobs reference
    previousJobsRef.current = new Map(currentJobs);
  }, [state.jobs]);

  // Cleanup SSE clients on unmount
  useEffect(() => {
    return () => {
      // Disconnect all SSE clients on unmount
      state.sseClients.forEach(client => client.disconnect());
    };
  }, [state.sseClients]);

  const subscribeTo = useCallback((requestId: string) => {
    // Don't create duplicate SSE clients
    if (state.sseClients.has(requestId)) {
      console.log(`Already subscribed to scan progress: ${requestId}`);
      return;
    }

    console.log(`Subscribing to scan progress via SSE: ${requestId}`);
    const sseClient = new SSEClient(requestId);
    
    // Set up progress listener
    sseClient.onProgress((data) => {
      dispatch({ type: 'UPDATE_SCAN_PROGRESS', payload: data });
    });

    // Set up error listener
    sseClient.onError((error) => {
      console.error(`SSE error for scan ${requestId}:`, error);
    });

    // Connect and add to state
    sseClient.connect();
    dispatch({ type: 'ADD_SSE_CLIENT', payload: { requestId, client: sseClient } });
  }, [state.sseClients]);

  const unsubscribeFrom = useCallback((requestId: string) => {
    console.log(`Unsubscribing from scan progress: ${requestId}`);
    dispatch({ type: 'REMOVE_SSE_CLIENT', payload: requestId });
  }, []);

  const refreshJobs = useCallback(async () => {
    try {
      console.log('Refreshing scan jobs...');
      const response = await fetch('/api/scans/jobs');
      if (response.ok) {
        const data = await response.json();
        const jobs: ScanJob[] = (data.jobs || []).map((job: any) => ({
          ...job,
          startTime: job.startTime || new Date().toISOString(),
          lastUpdate: new Date().toISOString()
        }));
        
        console.log(`Found ${jobs.length} scan jobs, ${jobs.filter(j => j.status === 'RUNNING').length} running`);
        dispatch({ type: 'SET_JOBS', payload: jobs });
        
        // Subscribe to all running jobs
        const runningJobs = jobs.filter(job => job.status === 'RUNNING');
        if (runningJobs.length > 0) {
          console.log(`Subscribing to ${runningJobs.length} running jobs...`);
          runningJobs.forEach(job => {
            console.log(`Subscribing to running job: ${job.requestId}`);
            subscribeTo(job.requestId);
          });
        }
      }
    } catch (error) {
      console.error('Error fetching scan jobs:', error);
    }
  }, [subscribeTo]);

  const addScanJob = useCallback((job: Omit<ScanJob, 'startTime' | 'lastUpdate'>) => {
    dispatch({ type: 'ADD_SCAN_JOB', payload: job });
    
    // Automatically subscribe to this job's progress via SSE
    console.log(`Auto-subscribing to new scan: ${job.requestId}`);
    subscribeTo(job.requestId);
  }, [subscribeTo]);

  const removeScanJob = useCallback((requestId: string) => {
    unsubscribeFrom(requestId);
    dispatch({ type: 'REMOVE_SCAN_JOB', payload: requestId });
  }, [unsubscribeFrom]);

  const clearCompletedJobs = useCallback(() => {
    dispatch({ type: 'CLEAR_COMPLETED_JOBS' });
  }, []);

  const getJobByRequestId = useCallback((requestId: string) => {
    return state.jobs.get(requestId);
  }, [state.jobs]);

  const setOnScanComplete = useCallback((callback: (job: ScanJob) => void) => {
    onScanCompleteRef.current = callback;
  }, []);

  // Auto-refresh jobs periodically - less frequent to avoid multiple connections
  useEffect(() => {
    refreshJobs();
    const interval = setInterval(refreshJobs, 60000); // Every 60 seconds (reduced from 30)
    return () => clearInterval(interval);
  }, [refreshJobs]);

  // Auto-cleanup completed jobs
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      dispatch({ type: 'AUTO_CLEANUP_COMPLETED' });
    }, 10000); // Check every 10 seconds

    return () => clearInterval(cleanupInterval);
  }, []);

  // Convert Map to arrays for easier consumption
  const jobs = Array.from(state.jobs.values());
  const runningJobs = jobs.filter(job => job.status === 'RUNNING');
  const completedJobs = jobs.filter(job => job.status !== 'RUNNING');

  const contextValue: ScanningContextType = {
    jobs,
    runningJobs,
    completedJobs,
    subscribeTo,
    unsubscribeFrom,
    addScanJob,
    removeScanJob,
    refreshJobs,
    clearCompletedJobs,
    getJobByRequestId,
    setOnScanComplete
  };

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