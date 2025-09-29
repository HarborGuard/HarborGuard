"use client"

import { useEffect, useCallback, useRef } from 'react';
import SSEManager, { ConnectionStatus } from '@/lib/sse-manager';
import { ScanProgressEvent } from '@/lib/scanner/types';

interface UseSSEOptions {
  onProgress?: (requestId: string, data: ScanProgressEvent) => void;
  onStatusChange?: (requestId: string, status: ConnectionStatus) => void;
  onError?: (requestId: string, error: string) => void;
}

/**
 * Custom hook to interact with SSEManager
 * Provides a clean React interface to the singleton SSE manager
 */
export function useSSE(options: UseSSEOptions = {}) {
  const managerRef = useRef<SSEManager | undefined>(undefined);
  const cleanupFnsRef = useRef<(() => void)[]>([]);

  useEffect(() => {
    // Get SSEManager instance
    managerRef.current = SSEManager.getInstance();
    const manager = managerRef.current;

    // Set up event listeners
    if (options.onProgress) {
      const progressHandler = (requestId: string, data: ScanProgressEvent) => {
        options.onProgress!(requestId, data);
      };
      manager.on('progress', progressHandler);
      cleanupFnsRef.current.push(() => manager.off('progress', progressHandler));
    }

    if (options.onStatusChange) {
      const statusHandler = (requestId: string, status: ConnectionStatus) => {
        options.onStatusChange!(requestId, status);
      };
      manager.on('statusChange', statusHandler);
      cleanupFnsRef.current.push(() => manager.off('statusChange', statusHandler));
    }

    if (options.onError) {
      const errorHandler = (requestId: string, error: string) => {
        options.onError!(requestId, error);
      };
      manager.on('error', errorHandler);
      cleanupFnsRef.current.push(() => manager.off('error', errorHandler));
    }

    // Cleanup on unmount
    return () => {
      cleanupFnsRef.current.forEach(fn => fn());
      cleanupFnsRef.current = [];
    };
  }, [options.onProgress, options.onStatusChange, options.onError]);

  const connect = useCallback((requestId: string) => {
    return managerRef.current?.connect(requestId) ?? false;
  }, []);

  const disconnect = useCallback((requestId: string) => {
    managerRef.current?.disconnect(requestId);
  }, []);

  const disconnectAll = useCallback(() => {
    managerRef.current?.disconnectAll();
  }, []);

  const getConnectionStatus = useCallback((requestId: string) => {
    return managerRef.current?.getConnectionStatus(requestId) ?? null;
  }, []);

  const getActiveConnections = useCallback(() => {
    return managerRef.current?.getActiveConnections() ?? [];
  }, []);

  return {
    connect,
    disconnect,
    disconnectAll,
    getConnectionStatus,
    getActiveConnections,
  };
}