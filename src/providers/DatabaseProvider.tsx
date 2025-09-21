"use client";

import React, { createContext, useContext, useReducer, useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import type {
  Image,
  ScanWithImage,
  VulnerabilityWithImages,
  BulkScanBatch,
  Scanner,
  AuditLog,
  DatabaseContextType,
  ScanStatus,
  Severity
} from '@/types';

// Database state structure
interface DatabaseState {
  // Images
  images: Image[];
  imagesLoading: boolean;
  imagesError: string | null;
  
  // Scans
  scans: ScanWithImage[];
  scansLoading: boolean;
  scansError: string | null;
  
  // Vulnerabilities
  vulnerabilities: VulnerabilityWithImages[];
  vulnerabilitiesLoading: boolean;
  vulnerabilitiesError: string | null;
  
  // Scanners
  scanners: Scanner[];
  scannersLoading: boolean;
  scannersError: string | null;
  
  
  // Bulk Scans
  bulkScans: BulkScanBatch[];
  bulkScansLoading: boolean;
  bulkScansError: string | null;
  
  // Audit Logs
  auditLogs: AuditLog[];
  auditLogsLoading: boolean;
  auditLogsError: string | null;
  
  // Pagination
  pagination: {
    images: { hasMore: boolean; offset: number };
    scans: { hasMore: boolean; offset: number };
    vulnerabilities: { hasMore: boolean; offset: number };
    auditLogs: { hasMore: boolean; offset: number };
  };
}

type DatabaseAction =
  // Images
  | { type: 'SET_IMAGES_LOADING'; payload: boolean }
  | { type: 'SET_IMAGES'; payload: { images: Image[]; hasMore: boolean } }
  | { type: 'APPEND_IMAGES'; payload: { images: Image[]; hasMore: boolean } }
  | { type: 'SET_IMAGES_ERROR'; payload: string | null }
  | { type: 'ADD_IMAGE'; payload: Image }
  | { type: 'UPDATE_IMAGE'; payload: Image }
  | { type: 'REMOVE_IMAGE'; payload: string }
  
  // Scans
  | { type: 'SET_SCANS_LOADING'; payload: boolean }
  | { type: 'SET_SCANS'; payload: { scans: ScanWithImage[]; hasMore: boolean } }
  | { type: 'APPEND_SCANS'; payload: { scans: ScanWithImage[]; hasMore: boolean } }
  | { type: 'SET_SCANS_ERROR'; payload: string | null }
  | { type: 'ADD_SCAN'; payload: ScanWithImage }
  | { type: 'UPDATE_SCAN'; payload: ScanWithImage }
  
  // Vulnerabilities
  | { type: 'SET_VULNERABILITIES_LOADING'; payload: boolean }
  | { type: 'SET_VULNERABILITIES'; payload: { vulnerabilities: VulnerabilityWithImages[]; hasMore: boolean } }
  | { type: 'SET_VULNERABILITIES_ERROR'; payload: string | null }
  
  // Scanners
  | { type: 'SET_SCANNERS_LOADING'; payload: boolean }
  | { type: 'SET_SCANNERS'; payload: Scanner[] }
  | { type: 'SET_SCANNERS_ERROR'; payload: string | null }
  
  
  // Bulk Scans
  | { type: 'SET_BULK_SCANS_LOADING'; payload: boolean }
  | { type: 'SET_BULK_SCANS'; payload: BulkScanBatch[] }
  | { type: 'SET_BULK_SCANS_ERROR'; payload: string | null }
  | { type: 'ADD_BULK_SCAN'; payload: BulkScanBatch }
  | { type: 'UPDATE_BULK_SCAN'; payload: BulkScanBatch }
  
  // Audit Logs
  | { type: 'SET_AUDIT_LOGS_LOADING'; payload: boolean }
  | { type: 'SET_AUDIT_LOGS'; payload: { logs: AuditLog[]; hasMore: boolean } }
  | { type: 'SET_AUDIT_LOGS_ERROR'; payload: string | null };

const initialState: DatabaseState = {
  images: [],
  imagesLoading: false,
  imagesError: null,
  
  scans: [],
  scansLoading: false,
  scansError: null,
  
  vulnerabilities: [],
  vulnerabilitiesLoading: false,
  vulnerabilitiesError: null,
  
  scanners: [],
  scannersLoading: false,
  scannersError: null,
  
  
  bulkScans: [],
  bulkScansLoading: false,
  bulkScansError: null,
  
  auditLogs: [],
  auditLogsLoading: false,
  auditLogsError: null,
  
  pagination: {
    images: { hasMore: true, offset: 0 },
    scans: { hasMore: true, offset: 0 },
    vulnerabilities: { hasMore: true, offset: 0 },
    auditLogs: { hasMore: true, offset: 0 },
  },
};

function databaseReducer(state: DatabaseState, action: DatabaseAction): DatabaseState {
  switch (action.type) {
    // Images
    case 'SET_IMAGES_LOADING':
      return { ...state, imagesLoading: action.payload };
    case 'SET_IMAGES':
      return {
        ...state,
        images: action.payload.images,
        imagesLoading: false,
        imagesError: null,
        pagination: {
          ...state.pagination,
          images: { hasMore: action.payload.hasMore, offset: action.payload.images.length }
        }
      };
    case 'APPEND_IMAGES':
      return {
        ...state,
        images: [...state.images, ...action.payload.images],
        imagesLoading: false,
        pagination: {
          ...state.pagination,
          images: { hasMore: action.payload.hasMore, offset: state.images.length + action.payload.images.length }
        }
      };
    case 'SET_IMAGES_ERROR':
      return { ...state, imagesError: action.payload, imagesLoading: false };
    case 'ADD_IMAGE':
      return { ...state, images: [action.payload, ...state.images] };
    case 'UPDATE_IMAGE':
      return {
        ...state,
        images: state.images.map(img => img.id === action.payload.id ? action.payload : img)
      };
    case 'REMOVE_IMAGE':
      return {
        ...state,
        images: state.images.filter(img => img.id !== action.payload)
      };
    
    // Scans
    case 'SET_SCANS_LOADING':
      return { ...state, scansLoading: action.payload };
    case 'SET_SCANS':
      return {
        ...state,
        scans: action.payload.scans,
        scansLoading: false,
        scansError: null,
        pagination: {
          ...state.pagination,
          scans: { hasMore: action.payload.hasMore, offset: action.payload.scans.length }
        }
      };
    case 'APPEND_SCANS':
      return {
        ...state,
        scans: [...state.scans, ...action.payload.scans],
        scansLoading: false,
        pagination: {
          ...state.pagination,
          scans: { hasMore: action.payload.hasMore, offset: state.scans.length + action.payload.scans.length }
        }
      };
    case 'SET_SCANS_ERROR':
      return { ...state, scansError: action.payload, scansLoading: false };
    case 'ADD_SCAN':
      return { ...state, scans: [action.payload, ...state.scans] };
    case 'UPDATE_SCAN':
      return {
        ...state,
        scans: state.scans.map(scan => scan.id === action.payload.id ? action.payload : scan)
      };
    
    // Vulnerabilities
    case 'SET_VULNERABILITIES_LOADING':
      return { ...state, vulnerabilitiesLoading: action.payload };
    case 'SET_VULNERABILITIES':
      return {
        ...state,
        vulnerabilities: action.payload.vulnerabilities,
        vulnerabilitiesLoading: false,
        vulnerabilitiesError: null,
        pagination: {
          ...state.pagination,
          vulnerabilities: { hasMore: action.payload.hasMore, offset: action.payload.vulnerabilities.length }
        }
      };
    case 'SET_VULNERABILITIES_ERROR':
      return { ...state, vulnerabilitiesError: action.payload, vulnerabilitiesLoading: false };
    
    // Scanners
    case 'SET_SCANNERS_LOADING':
      return { ...state, scannersLoading: action.payload };
    case 'SET_SCANNERS':
      return { ...state, scanners: action.payload, scannersLoading: false, scannersError: null };
    case 'SET_SCANNERS_ERROR':
      return { ...state, scannersError: action.payload, scannersLoading: false };
    
    
    // Bulk Scans
    case 'SET_BULK_SCANS_LOADING':
      return { ...state, bulkScansLoading: action.payload };
    case 'SET_BULK_SCANS':
      return { ...state, bulkScans: action.payload, bulkScansLoading: false, bulkScansError: null };
    case 'SET_BULK_SCANS_ERROR':
      return { ...state, bulkScansError: action.payload, bulkScansLoading: false };
    case 'ADD_BULK_SCAN':
      return { ...state, bulkScans: [action.payload, ...state.bulkScans] };
    case 'UPDATE_BULK_SCAN':
      return {
        ...state,
        bulkScans: state.bulkScans.map(bulk => bulk.id === action.payload.id ? action.payload : bulk)
      };
    
    // Audit Logs
    case 'SET_AUDIT_LOGS_LOADING':
      return { ...state, auditLogsLoading: action.payload };
    case 'SET_AUDIT_LOGS':
      return {
        ...state,
        auditLogs: action.payload.logs,
        auditLogsLoading: false,
        auditLogsError: null,
        pagination: {
          ...state.pagination,
          auditLogs: { hasMore: action.payload.hasMore, offset: action.payload.logs.length }
        }
      };
    case 'SET_AUDIT_LOGS_ERROR':
      return { ...state, auditLogsError: action.payload, auditLogsLoading: false };
    
    default:
      return state;
  }
}

const DatabaseContext = createContext<DatabaseContextType | undefined>(undefined);

export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(databaseReducer, initialState);
  const refreshTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Debounced refresh to prevent multiple rapid API calls
  const debouncedRefresh = useCallback((key: string, refreshFn: () => Promise<void>, delay = 100) => {
    const timeouts = refreshTimeoutsRef.current;
    
    if (timeouts.has(key)) {
      clearTimeout(timeouts.get(key)!);
    }
    
    const timeout = setTimeout(() => {
      refreshFn().finally(() => {
        timeouts.delete(key);
      });
    }, delay);
    
    timeouts.set(key, timeout);
  }, []);

  // API Helper with error handling
  const apiCall = useCallback(async (
    endpoint: string,
    options?: RequestInit,
    showError = true
  ) => {
    try {
      const response = await fetch(endpoint, {
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
        ...options,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`API Error: ${response.status} - ${error}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`API call failed for ${endpoint}:`, error);
      if (showError) {
        toast.error(`Failed to ${options?.method || 'fetch'} ${endpoint}`);
      }
      throw error;
    }
  }, []);

  // Images
  const refreshImages = useCallback(async (loadMore = false) => {
    try {
      dispatch({ type: 'SET_IMAGES_LOADING', payload: true });
      
      const offset = loadMore ? state.pagination.images.offset : 0;
      const data = await apiCall(`/api/images?limit=100&offset=${offset}`);
      
      const hasMore = offset + data.images.length < data.total;
      
      if (loadMore) {
        dispatch({ type: 'APPEND_IMAGES', payload: { images: data.images, hasMore } });
      } else {
        dispatch({ type: 'SET_IMAGES', payload: { images: data.images, hasMore } });
      }
    } catch (error) {
      dispatch({ type: 'SET_IMAGES_ERROR', payload: (error as Error).message });
    }
  }, [apiCall]);

  // Scans
  const refreshScans = useCallback(async (loadMore = false, status?: ScanStatus) => {
    try {
      dispatch({ type: 'SET_SCANS_LOADING', payload: true });
      
      const offset = loadMore ? state.pagination.scans.offset : 0;
      const statusParam = status ? `&status=${status}` : '';
      const data = await apiCall(`/api/scans?limit=100&offset=${offset}${statusParam}`);
      
      const hasMore = offset + data.scans.length < data.total;
      
      if (loadMore) {
        dispatch({ type: 'APPEND_SCANS', payload: { scans: data.scans, hasMore } });
      } else {
        dispatch({ type: 'SET_SCANS', payload: { scans: data.scans, hasMore } });
      }
    } catch (error) {
      dispatch({ type: 'SET_SCANS_ERROR', payload: (error as Error).message });
    }
  }, [apiCall]);

  // Vulnerabilities
  const refreshVulnerabilities = useCallback(async (severity?: Severity) => {
    try {
      dispatch({ type: 'SET_VULNERABILITIES_LOADING', payload: true });
      
      const severityParam = severity ? `?severity=${severity}` : '';
      const data = await apiCall(`/api/vulnerabilities${severityParam}`);
      
      const hasMore = data.vulnerabilities.length >= 25; // Simple hasMore logic
      
      dispatch({ type: 'SET_VULNERABILITIES', payload: { vulnerabilities: data.vulnerabilities, hasMore } });
    } catch (error) {
      dispatch({ type: 'SET_VULNERABILITIES_ERROR', payload: (error as Error).message });
    }
  }, [apiCall]);


  // Bulk Scans
  const refreshBulkScans = useCallback(async () => {
    try {
      dispatch({ type: 'SET_BULK_SCANS_LOADING', payload: true });
      
      const data = await apiCall('/api/scans/bulk');
      
      dispatch({ type: 'SET_BULK_SCANS', payload: data });
    } catch (error) {
      dispatch({ type: 'SET_BULK_SCANS_ERROR', payload: (error as Error).message });
    }
  }, [apiCall]);

  // Refresh All
  const refreshAll = useCallback(async () => {
    await Promise.allSettled([
      debouncedRefresh('images', () => refreshImages()),
      debouncedRefresh('scans', () => refreshScans()),
      debouncedRefresh('vulnerabilities', () => refreshVulnerabilities()),
      debouncedRefresh('bulkScans', () => refreshBulkScans()),
    ]);
  }, [debouncedRefresh, refreshImages, refreshScans, refreshVulnerabilities, refreshBulkScans]);

  // Initial data load
  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      refreshTimeoutsRef.current.forEach(timeout => clearTimeout(timeout));
      refreshTimeoutsRef.current.clear();
    };
  }, []);

  const contextValue: DatabaseContextType = {
    // State
    ...state,
    
    // Actions
    refreshAll,
    refreshImages: async () => { debouncedRefresh('images', () => refreshImages()); },
    refreshScans: async () => { debouncedRefresh('scans', () => refreshScans()); },
    refreshVulnerabilities: async () => { debouncedRefresh('vulnerabilities', () => refreshVulnerabilities()); },
    refreshBulkScans: async () => { debouncedRefresh('bulkScans', () => refreshBulkScans()); },
  };

  return (
    <DatabaseContext.Provider value={contextValue}>
      {children}
    </DatabaseContext.Provider>
  );
}

export function useDatabase(): DatabaseContextType {
  const context = useContext(DatabaseContext);
  if (!context) {
    throw new Error('useDatabase must be used within a DatabaseProvider');
  }
  return context;
}

// Specialized hooks for specific data types
export function useImages() {
  const { images, imagesLoading, imagesError, refreshImages } = useDatabase();
  return { images, loading: imagesLoading, error: imagesError, refresh: refreshImages };
}

export function useScans() {
  const { scans, scansLoading, scansError, refreshScans } = useDatabase();
  return { scans, loading: scansLoading, error: scansError, refresh: refreshScans };
}

export function useVulnerabilities() {
  const { vulnerabilities, vulnerabilitiesLoading, vulnerabilitiesError, refreshVulnerabilities } = useDatabase();
  return { vulnerabilities, loading: vulnerabilitiesLoading, error: vulnerabilitiesError, refresh: refreshVulnerabilities };
}


export function useBulkScans() {
  const { bulkScans, bulkScansLoading, bulkScansError, refreshBulkScans } = useDatabase();
  return { bulkScans, loading: bulkScansLoading, error: bulkScansError, refresh: refreshBulkScans };
}
