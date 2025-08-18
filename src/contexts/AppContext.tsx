"use client"

import React, { createContext, useContext, useReducer, useEffect, ReactNode, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { LegacyScan, ScanWithImage } from '@/types'
import { 
  aggregateVulnerabilities,
  calculateRiskScore,
  aggregateCompliance,
  countMisconfigurations,
  countSecrets,
  calculateScanDuration,
  calculateFixable,
  getHighestCVSS,
  getOSVPackageStats,
  countOSVVulnerabilities,
} from '@/lib/scan-aggregations'

// Use LegacyScan for backward compatibility with existing UI components
type Scan = LegacyScan

// Transform database scans to legacy UI format
function transformScansForUI(scans: ScanWithImage[]): LegacyScan[] {
  return scans.map(scan => {
    const vulnerabilities = aggregateVulnerabilities(scan)
    const compliance = aggregateCompliance(scan)
    const riskScore = calculateRiskScore(scan)
    const fixable = calculateFixable(scan)
    const duration = calculateScanDuration(scan)
    
    return {
      id: Math.abs(scan.id.split('').reduce((a, b) => ((a << 5) - a + b.charCodeAt(0)) | 0, 0)), // Convert cuid to stable number
      imageId: scan.image.id, // Add imageId for navigation
      imageName: scan.image.name, // Add image name for new navigation
      uid: scan.requestId,
      image: `${scan.image.name}:${scan.image.tag}`, // Full image name with tag
      source: scan.source || undefined, // Add source information
      digestShort: scan.image.digest?.slice(7, 19) || '',
      platform: scan.image.platform || 'unknown',
      sizeMb: scan.sizeBytes ? Math.round(parseInt(scan.sizeBytes) / 1024 / 1024) : 0,
      riskScore,
      
      severities: {
        crit: vulnerabilities.critical,
        high: vulnerabilities.high,
        med: vulnerabilities.medium,
        low: vulnerabilities.low,
      },
      
      fixable,
      highestCvss: getHighestCVSS(scan),
      misconfigs: countMisconfigurations(scan),
      secrets: countSecrets(scan),
      
      // OSV-specific metrics
      osvPackages: getOSVPackageStats(scan).totalPackages,
      osvVulnerable: getOSVPackageStats(scan).vulnerablePackages,
      osvEcosystems: Object.keys(getOSVPackageStats(scan).ecosystemCounts),
      
      compliance: {
        dockle: compliance.dockle?.grade,
      },
      
      policy: riskScore > 75 ? "Blocked" : riskScore > 50 ? "Warn" : "Pass",
      
      delta: {
        newCrit: 0, // Would need comparison with previous scan
        resolvedTotal: 0,
      },
      
      inUse: {
        clusters: 0, // Would need K8s integration
        pods: 0,
      },
      
      baseImage: extractBaseImage(scan.image.name),
      baseUpdate: undefined,
      signed: false,
      attested: false,
      sbomFormat: "spdx",
      dbAge: duration,
      registry: scan.image.registry || undefined,
      project: undefined,
      lastScan: typeof scan.finishedAt === 'string' ? scan.finishedAt : scan.finishedAt?.toISOString() || (typeof scan.createdAt === 'string' ? scan.createdAt : scan.createdAt.toISOString()),
      status: mapScanStatus(scan.status),
      header: undefined,
      type: undefined,
      target: undefined,
      limit: undefined,
      
      scannerReports: scan.scannerReports,
      digest: scan.image.digest,
      layers: [], // Would extract from metadata
      osInfo: extractOsInfo(scan),
    }
  })
}

// Helper functions
function extractBaseImage(imageName: string): string | undefined {
  if (imageName.includes('node')) return 'node'
  if (imageName.includes('python')) return 'python'
  if (imageName.includes('nginx')) return 'nginx'
  if (imageName.includes('alpine')) return 'alpine'
  if (imageName.includes('ubuntu')) return 'ubuntu'
  if (imageName.includes('debian')) return 'debian'
  return imageName.split(':')[0]
}

function mapScanStatus(status: string): "Complete" | "Queued" | "Error" | "Prior" {
  switch (status) {
    case 'SUCCESS': return 'Complete'
    case 'RUNNING': return 'Queued'
    case 'FAILED': return 'Error'
    case 'PARTIAL': return 'Complete'
    case 'CANCELLED': return 'Error'
    default: return 'Prior'
  }
}

function extractOsInfo(scan: ScanWithImage): { family: string; name: string } | undefined {
  const trivyReport = scan.scannerReports?.trivy
  if (trivyReport?.Metadata?.OS) {
    return {
      family: trivyReport.Metadata.OS.Family,
      name: trivyReport.Metadata.OS.Name,
    }
  }
  return undefined
}


interface AppState {
  scans: Scan[]
  loading: boolean
  error: string | null
  pagination: {
    total: number
    limit: number
    offset: number
    hasMore: boolean
  }
}

type AppAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_SCANS'; payload: { scans: Scan[], pagination: AppState['pagination'] } }
  | { type: 'APPEND_SCANS'; payload: { scans: Scan[], pagination: AppState['pagination'] } }
  | { type: 'UPDATE_SCAN'; payload: Scan }
  | { type: 'ADD_SCAN'; payload: Scan }
  | { type: 'DELETE_SCAN'; payload: number }

const initialState: AppState = {
  scans: [],
  loading: false,
  error: null,
  pagination: {
    total: 0,
    limit: 25,
    offset: 0,
    hasMore: false
  }
}

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: action.payload }
    case 'SET_ERROR':
      return { ...state, error: action.payload, loading: false }
    case 'SET_SCANS':
      return { 
        ...state, 
        scans: action.payload.scans, 
        pagination: action.payload.pagination,
        loading: false 
      }
    case 'APPEND_SCANS':
      return {
        ...state,
        scans: [...state.scans, ...action.payload.scans],
        pagination: action.payload.pagination,
        loading: false
      }
    case 'UPDATE_SCAN':
      return {
        ...state,
        scans: state.scans.map(scan =>
          scan.id === action.payload.id ? action.payload : scan
        )
      }
    case 'ADD_SCAN':
      return { ...state, scans: [...state.scans, action.payload] }
    case 'DELETE_SCAN':
      return {
        ...state,
        scans: state.scans.filter(scan => scan.id !== action.payload)
      }
    default:
      return state
  }
}

interface AppContextType {
  state: AppState
  dispatch: React.Dispatch<AppAction>
  refreshData: () => Promise<void>
  loadMore: () => Promise<void>
  handleScanComplete: (job: any) => Promise<void>
}

const AppContext = createContext<AppContextType | undefined>(undefined)

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState)
  const refreshPromiseRef = useRef<Promise<void> | null>(null)
  const router = useRouter()

  const loadData = async (loadMore: boolean = false) => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true })
      dispatch({ type: 'SET_ERROR', payload: null })

      const offset = loadMore ? state.scans.length : 0
      
      // Use optimized aggregated endpoint for better performance
      const scansRes = await fetch(`/api/scans/aggregated?limit=${state.pagination.limit}&offset=${offset}`)

      if (!scansRes.ok) {
        throw new Error(`Failed to fetch scans: ${scansRes.status}`)
      }

      const scansData = await scansRes.json()

      // The aggregated endpoint returns data in the format we need
      const transformedScans = scansData.scans?.map((scan: any) => ({
        id: Math.abs(scan.id.split('').reduce((a: number, b: string) => ((a << 5) - a + b.charCodeAt(0)) | 0, 0)),
        imageId: scan.imageId,
        imageName: scan.image.name,
        uid: scan.requestId,
        image: `${scan.image.name}:${scan.image.tag}`,
        source: scan.source,
        digestShort: scan.image.digest?.slice(7, 19) || '',
        platform: 'unknown',
        sizeMb: 0,
        riskScore: scan.riskScore || 0,
        severities: {
          crit: scan.vulnerabilityCount?.critical || 0,
          high: scan.vulnerabilityCount?.high || 0,
          med: scan.vulnerabilityCount?.medium || 0,
          low: scan.vulnerabilityCount?.low || 0,
        },
        total: scan.vulnerabilityCount?.total || 0,
        scanTime: new Date(scan.startedAt).toLocaleString(),
        status: mapScanStatus(scan.status),
        statusRaw: scan.status,
        compliance: {
          dockle: undefined // The data table expects a dockle property
        },
        misconfiguration: { pass: 0, warn: 0, info: 0 },
        secretsData: { count: 0, results: [] }, // Rename to avoid conflict
        fixed: 0,
        fixable: {
          count: 0,
          percent: 0
        },
        misconfigs: 0,
        secrets: 0, // This should be a number for the reduce operation
        osvPackages: 0,
        osvVulnerable: 0,
        osvEcosystems: [],
        baseImage: extractBaseImage(scan.image.name),
        osInfo: undefined
      })) || []

      const actionType = loadMore ? 'APPEND_SCANS' : 'SET_SCANS'
      dispatch({ 
        type: actionType, 
        payload: { 
          scans: transformedScans, 
          pagination: scansData.pagination 
        } 
      })
    } catch (error) {
      console.error('Failed to load data:', error)
      dispatch({ type: 'SET_ERROR', payload: error instanceof Error ? error.message : 'Unknown error' })
    }
  }

  const refreshData = async () => {
    // Debounce multiple rapid refresh calls
    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    refreshPromiseRef.current = loadData(false).finally(() => {
      refreshPromiseRef.current = null;
    });

    return refreshPromiseRef.current;
  }

  const loadMore = async () => {
    if (!state.pagination.hasMore || state.loading) {
      return;
    }
    await loadData(true);
  }

  const handleScanComplete = async (job: any) => {
    console.log(`Refreshing data due to scan completion: ${job.scanId}`);
    await refreshData();
    
    // Extract image name from job.imageName or fallback to parsing from scan data
    const imageName = job.imageName || 'unknown';
    const scanId = job.scanId;
    
    // Log the scan completion via API call
    try {
      await fetch('/api/audit-logs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          eventType: 'scan_complete',
          category: 'informative',
          userIp: 'system',
          action: `Completed scan for ${imageName}`,
          resource: imageName,
          details: { scanId, imageName }
        }),
      });
    } catch (error) {
      console.error('Failed to log scan completion:', error);
    }
    
    // Show success toast notification with navigation action
    toast.success("Scan completed successfully!", {
      description: `Scan ${scanId} has finished processing`,
      action: {
        label: "View Results",
        onClick: () => {
          router.push(`/image/${encodeURIComponent(imageName)}/scan/${scanId}`);
        }
      }
    });
  }

  useEffect(() => {
    loadData(false)
  }, [])

  return (
    <AppContext.Provider value={{ state, dispatch, refreshData, loadMore, handleScanComplete }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const context = useContext(AppContext)
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider')
  }
  return context
}