/**
 * Hook for checking application version updates
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { logger } from '@/lib/logger';
import { config } from '@/lib/config';

interface VersionInfo {
  current: string;
  latest?: string;
  hasUpdate: boolean;
  lastChecked: Date;
  error?: string;
}

interface VersionCheckState {
  versionInfo: VersionInfo | null;
  loading: boolean;
  error: string | null;
}

export function useVersionCheck(checkOnMount: boolean = true) {
  const [state, setState] = useState<VersionCheckState>({
    versionInfo: null,
    loading: false,
    error: null
  });
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasCheckedRef = useRef(false);

  const checkVersion = useCallback(async () => {
    setState(prev => {
      if (prev.loading) return prev; // Prevent concurrent checks
      return { ...prev, loading: true, error: null };
    });
    
    try {
      logger.debug('Checking for version updates...');
      
      const response = await fetch('/api/version', {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Version check failed: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success && data.version) {
        setState({
          versionInfo: {
            ...data.version,
            lastChecked: new Date(data.version.lastChecked)
          },
          loading: false,
          error: null
        });
        
        if (data.version.hasUpdate) {
          logger.info(`New version available: ${data.version.latest} (current: ${data.version.current})`);
        }
      } else {
        throw new Error(data.error || 'Invalid response format');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Version check failed:', errorMessage);
      
      setState({
        versionInfo: null,
        loading: false,
        error: errorMessage
      });
    }
  }, []); // Remove state.loading dependency to prevent recreation

  // Check on mount if requested (only once) and version checking is enabled
  useEffect(() => {
    if (config.versionCheckEnabled && checkOnMount && !hasCheckedRef.current) {
      hasCheckedRef.current = true;
      // Add delay to avoid blocking initial page load
      const timer = setTimeout(checkVersion, 5000);
      return () => clearTimeout(timer);
    }
  }, [checkOnMount, checkVersion]);

  // Periodic check every 6 hours (setup only once) if version checking is enabled
  useEffect(() => {
    if (config.versionCheckEnabled && !intervalRef.current) {
      intervalRef.current = setInterval(() => {
        checkVersion();
      }, 6 * 60 * 60 * 1000); // 6 hours
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []); // No dependencies to prevent recreation

  return {
    versionInfo: state.versionInfo,
    loading: state.loading,
    error: state.error,
    checkVersion,
    hasUpdate: state.versionInfo?.hasUpdate || false,
    currentVersion: state.versionInfo?.current || 'Unknown',
    latestVersion: state.versionInfo?.latest
  };
}