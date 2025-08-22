// Main database hooks for direct API operations
// These hooks provide CRUD operations and complement the DatabaseProvider

import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import type {
  Image,
  Scan,
  ScanWithImage,
  Scanner,
  ScanResult,
  Vulnerability,
  ImageVulnerability,
  CveClassification,
  BulkScanBatch,
  AuditLog,
  CreateScanRequest,
  CreateImageRequest,
  CreateVulnerabilityRequest,
  CreateImageVulnerabilityRequest,
  ScanStatus,
  Severity
} from '@/types';

// Generic API hook with error handling
export function useAPI() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiCall = useCallback(async <T>(
    endpoint: string,
    options?: RequestInit,
    showSuccessToast = false,
    successMessage = 'Operation completed successfully'
  ): Promise<T> => {
    try {
      setLoading(true);
      setError(null);
      
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

      const data = await response.json();
      
      if (showSuccessToast) {
        toast.success(successMessage);
      }
      
      return data;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setError(errorMessage);
      toast.error(errorMessage);
      throw error;
    } finally {
      setLoading(false);
    }
  }, []);

  return { apiCall, loading, error };
}

// Image operations
export function useImageOperations() {
  const { apiCall, loading, error } = useAPI();

  const createImage = useCallback(async (data: CreateImageRequest): Promise<Image> => {
    return apiCall<Image>(
      '/api/images',
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      true,
      'Image created successfully'
    );
  }, [apiCall]);

  const updateImage = useCallback(async (id: string, data: Partial<Image>): Promise<Image> => {
    return apiCall<Image>(
      `/api/images/${id}`,
      {
        method: 'PUT',
        body: JSON.stringify(data),
      },
      true,
      'Image updated successfully'
    );
  }, [apiCall]);

  const deleteImage = useCallback(async (id: string): Promise<void> => {
    return apiCall<void>(
      `/api/images/${id}`,
      {
        method: 'DELETE',
      },
      true,
      'Image deleted successfully'
    );
  }, [apiCall]);

  const getImage = useCallback(async (id: string): Promise<Image> => {
    return apiCall<Image>(`/api/images/${id}`);
  }, [apiCall]);

  const getImageByName = useCallback(async (name: string, tag?: string): Promise<Image> => {
    const params = tag ? `?tag=${encodeURIComponent(tag)}` : '';
    return apiCall<Image>(`/api/images/name/${encodeURIComponent(name)}${params}`);
  }, [apiCall]);

  return {
    createImage,
    updateImage,
    deleteImage,
    getImage,
    getImageByName,
    loading,
    error,
  };
}

// Scan operations
export function useScanOperations() {
  const { apiCall, loading, error } = useAPI();

  const createScan = useCallback(async (data: CreateScanRequest): Promise<{ scan: Scan; requestId: string }> => {
    return apiCall<{ scan: Scan; requestId: string }>(
      '/api/scans',
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      true,
      'Scan started successfully'
    );
  }, [apiCall]);

  const getScan = useCallback(async (id: string): Promise<ScanWithImage> => {
    return apiCall<ScanWithImage>(`/api/scans/${id}`);
  }, [apiCall]);

  const updateScan = useCallback(async (id: string, data: Partial<Scan>): Promise<Scan> => {
    return apiCall<Scan>(
      `/api/scans/${id}`,
      {
        method: 'PUT',
        body: JSON.stringify(data),
      },
      true,
      'Scan updated successfully'
    );
  }, [apiCall]);

  const cancelScan = useCallback(async (id: string): Promise<Scan> => {
    return apiCall<Scan>(
      `/api/scans/${id}/cancel`,
      {
        method: 'POST',
      },
      true,
      'Scan cancelled successfully'
    );
  }, [apiCall]);

  const downloadScanReport = useCallback(async (imageId: string, scanId: string, format: 'json' | 'pdf' | 'csv' = 'json'): Promise<Blob> => {
    const response = await fetch(`/api/image/${encodeURIComponent(imageId)}/scan/${scanId}/download?format=${format}`);
    
    if (!response.ok) {
      throw new Error(`Failed to download report: ${response.status}`);
    }
    
    return response.blob();
  }, []);

  return {
    createScan,
    getScan,
    updateScan,
    cancelScan,
    downloadScanReport,
    loading,
    error,
  };
}

// Scanner operations
export function useScannerOperations() {
  const { apiCall, loading, error } = useAPI();

  const getScanner = useCallback(async (id: string): Promise<Scanner> => {
    return apiCall<Scanner>(`/api/scanners/${id}`);
  }, [apiCall]);

  const createScanner = useCallback(async (data: {
    name: string;
    version: string;
    type: string;
    isActive?: boolean;
    defaultConfig?: any;
  }): Promise<Scanner> => {
    return apiCall<Scanner>(
      '/api/scanners',
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      true,
      'Scanner created successfully'
    );
  }, [apiCall]);

  const updateScanner = useCallback(async (id: string, data: Partial<Scanner>): Promise<Scanner> => {
    return apiCall<Scanner>(
      `/api/scanners/${id}`,
      {
        method: 'PUT',
        body: JSON.stringify(data),
      },
      true,
      'Scanner updated successfully'
    );
  }, [apiCall]);

  return {
    getScanner,
    createScanner,
    updateScanner,
    loading,
    error,
  };
}

// Vulnerability operations
export function useVulnerabilityOperations() {
  const { apiCall, loading, error } = useAPI();

  const createVulnerability = useCallback(async (data: CreateVulnerabilityRequest): Promise<Vulnerability> => {
    return apiCall<Vulnerability>(
      '/api/vulnerabilities',
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      true,
      'Vulnerability created successfully'
    );
  }, [apiCall]);

  const getVulnerability = useCallback(async (id: string): Promise<Vulnerability> => {
    return apiCall<Vulnerability>(`/api/vulnerabilities/${id}`);
  }, [apiCall]);

  const updateVulnerability = useCallback(async (id: string, data: Partial<Vulnerability>): Promise<Vulnerability> => {
    return apiCall<Vulnerability>(
      `/api/vulnerabilities/${id}`,
      {
        method: 'PUT',
        body: JSON.stringify(data),
      },
      true,
      'Vulnerability updated successfully'
    );
  }, [apiCall]);

  const createImageVulnerability = useCallback(async (data: CreateImageVulnerabilityRequest): Promise<ImageVulnerability> => {
    return apiCall<ImageVulnerability>(
      '/api/image-vulnerabilities',
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      true,
      'Image vulnerability created successfully'
    );
  }, [apiCall]);

  return {
    createVulnerability,
    getVulnerability,
    updateVulnerability,
    createImageVulnerability,
    loading,
    error,
  };
}

// CVE Classification operations
export function useCveClassificationOperations() {
  const { apiCall, loading, error } = useAPI();

  const createClassification = useCallback(async (data: {
    imageId: string;
    imageVulnerabilityId: string;
    isFalsePositive: boolean;
    comment?: string;
  }): Promise<CveClassification> => {
    return apiCall<CveClassification>(
      `/api/images/${data.imageId}/cve-classifications`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      true,
      'CVE classification saved successfully'
    );
  }, [apiCall]);

  const updateClassification = useCallback(async (
    imageId: string,
    classificationId: string,
    data: Partial<CveClassification>
  ): Promise<CveClassification> => {
    return apiCall<CveClassification>(
      `/api/images/${imageId}/cve-classifications/${classificationId}`,
      {
        method: 'PUT',
        body: JSON.stringify(data),
      },
      true,
      'CVE classification updated successfully'
    );
  }, [apiCall]);

  return {
    createClassification,
    updateClassification,
    loading,
    error,
  };
}



// Bulk scan operations
export function useBulkScanOperations() {
  const { apiCall, loading, error } = useAPI();

  const createBulkScan = useCallback(async (data: {
    name?: string;
    patterns: any;
    totalImages: number;
  }): Promise<BulkScanBatch> => {
    return apiCall<BulkScanBatch>(
      '/api/bulk-scans',
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
      true,
      'Bulk scan started successfully'
    );
  }, [apiCall]);

  const getBulkScan = useCallback(async (id: string): Promise<BulkScanBatch> => {
    return apiCall<BulkScanBatch>(`/api/bulk-scans/${id}`);
  }, [apiCall]);

  const cancelBulkScan = useCallback(async (id: string): Promise<BulkScanBatch> => {
    return apiCall<BulkScanBatch>(
      `/api/bulk-scans/${id}/cancel`,
      {
        method: 'POST',
      },
      true,
      'Bulk scan cancelled successfully'
    );
  }, [apiCall]);

  return {
    createBulkScan,
    getBulkScan,
    cancelBulkScan,
    loading,
    error,
  };
}

// Search operations
export function useSearch() {
  const { apiCall, loading, error } = useAPI();

  const searchImages = useCallback(async (query: string): Promise<Image[]> => {
    return apiCall<Image[]>(`/api/search/images?q=${encodeURIComponent(query)}`);
  }, [apiCall]);

  const searchVulnerabilities = useCallback(async (query: string): Promise<Vulnerability[]> => {
    return apiCall<Vulnerability[]>(`/api/search/vulnerabilities?q=${encodeURIComponent(query)}`);
  }, [apiCall]);

  const searchScans = useCallback(async (query: string): Promise<ScanWithImage[]> => {
    return apiCall<ScanWithImage[]>(`/api/search/scans?q=${encodeURIComponent(query)}`);
  }, [apiCall]);

  return {
    searchImages,
    searchVulnerabilities,
    searchScans,
    loading,
    error,
  };
}

// Dashboard/Stats operations
export function useDashboard() {
  const { apiCall, loading, error } = useAPI();

  const getDashboardStats = useCallback(async (): Promise<{
    totalImages: number;
    totalScans: number;
    totalVulnerabilities: number;
    recentScans: ScanWithImage[];
    criticalVulnerabilities: number;
  }> => {
    return apiCall('/api/dashboard/stats');
  }, [apiCall]);

  return {
    getDashboardStats,
    loading,
    error,
  };
}