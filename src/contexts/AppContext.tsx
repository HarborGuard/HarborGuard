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

interface Repository {
  id: number
  name: string
  url: string
  description: string
  tags: string[]
  lastUpdated: string
  totalImages: number
  totalVulnerabilities: number
  riskScore: number
  owner: string
  private: boolean
  scanSchedule: string
  compliance: {
    policyEnabled: boolean
    autoBlock: boolean
    allowedSeverity: string
  }
}

interface Vulnerability {
  id: string
  severity: string
  cvssScore: number
  title: string
  description: string
  package: string
  version: string
  fixedVersion: string
  publishedDate: string
  lastModified: string
  epss: number
  kev: boolean
  fixable: boolean
  affectedImages: number[]
  cwe: string
  references: string[]
}

interface Policy {
  id: number
  name: string
  description: string
  enabled: boolean
  rules: Array<{
    type: string
    severity?: string
    action: string
    threshold: number
  }>
  compliance: {
    dockle: string
  }
  createdAt: string
  updatedAt: string
  assignedRepositories: number[]
}

interface User {
  id: number
  username: string
  email: string
  role: string
  fullName: string
  avatar: string
  department: string
  permissions: string[]
  preferences: {
    theme: string
    notifications: {
      email: boolean
      critical: boolean
      high: boolean
      medium: boolean
      low: boolean
    }
    dashboard: {
      defaultView: string
      autoRefresh: boolean
      refreshInterval: number
    }
  }
  lastLogin: string
  createdAt: string
}

interface AppState {
  scans: Scan[]
  repositories: Repository[]
  vulnerabilities: Vulnerability[]
  policies: Policy[]
  users: User[]
  currentUser: User | null
  loading: boolean
  error: string | null
}

type AppAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_SCANS'; payload: Scan[] }
  | { type: 'SET_REPOSITORIES'; payload: Repository[] }
  | { type: 'SET_VULNERABILITIES'; payload: Vulnerability[] }
  | { type: 'SET_POLICIES'; payload: Policy[] }
  | { type: 'SET_USERS'; payload: User[] }
  | { type: 'SET_CURRENT_USER'; payload: User | null }
  | { type: 'UPDATE_SCAN'; payload: Scan }
  | { type: 'ADD_SCAN'; payload: Scan }
  | { type: 'DELETE_SCAN'; payload: number }

const initialState: AppState = {
  scans: [],
  repositories: [],
  vulnerabilities: [],
  policies: [],
  users: [],
  currentUser: null,
  loading: false,
  error: null
}

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: action.payload }
    case 'SET_ERROR':
      return { ...state, error: action.payload, loading: false }
    case 'SET_SCANS':
      return { ...state, scans: action.payload, loading: false }
    case 'SET_REPOSITORIES':
      return { ...state, repositories: action.payload }
    case 'SET_VULNERABILITIES':
      return { ...state, vulnerabilities: action.payload }
    case 'SET_POLICIES':
      return { ...state, policies: action.payload }
    case 'SET_USERS':
      return { ...state, users: action.payload }
    case 'SET_CURRENT_USER':
      return { ...state, currentUser: action.payload }
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
  handleScanComplete: (job: any) => Promise<void>
}

const AppContext = createContext<AppContextType | undefined>(undefined)

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState)
  const refreshPromiseRef = useRef<Promise<void> | null>(null)
  const router = useRouter()

  const loadData = async () => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true })
      dispatch({ type: 'SET_ERROR', payload: null })

      // Fetch real scan data from API and fallback static data for others
      const [scansRes, reposRes, vulnsRes, policiesRes, usersRes] = await Promise.all([
        fetch('/api/scans?limit=100'),  // Fetch from database API
        fetch('/data/repositories.json'),
        fetch('/data/vulnerabilities.json'),
        fetch('/data/policies.json'),
        fetch('/data/users.json')
      ])

      if (!scansRes.ok || !reposRes.ok || !vulnsRes.ok || !policiesRes.ok || !usersRes.ok) {
        const errors = []
        if (!scansRes.ok) errors.push(`scans: ${scansRes.status}`)
        if (!reposRes.ok) errors.push(`repos: ${reposRes.status}`)
        if (!vulnsRes.ok) errors.push(`vulns: ${vulnsRes.status}`)
        if (!policiesRes.ok) errors.push(`policies: ${policiesRes.status}`)
        if (!usersRes.ok) errors.push(`users: ${usersRes.status}`)
        throw new Error(`Failed to fetch data: ${errors.join(', ')}`)
      }

      const [scansData, repositories, vulnerabilities, policies, users] = await Promise.all([
        scansRes.json(),
        reposRes.json(),
        vulnsRes.json(),
        policiesRes.json(),
        usersRes.json()
      ])

      // Transform database scans to legacy format for UI compatibility
      const transformedScans = transformScansForUI(scansData.scans || [])

      dispatch({ type: 'SET_SCANS', payload: transformedScans })
      dispatch({ type: 'SET_REPOSITORIES', payload: repositories })
      dispatch({ type: 'SET_VULNERABILITIES', payload: vulnerabilities })
      dispatch({ type: 'SET_POLICIES', payload: policies })
      dispatch({ type: 'SET_USERS', payload: users })
      
      dispatch({ type: 'SET_CURRENT_USER', payload: users[0] })
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

    refreshPromiseRef.current = loadData().finally(() => {
      refreshPromiseRef.current = null;
    });

    return refreshPromiseRef.current;
  }

  const handleScanComplete = async (job: any) => {
    console.log(`Refreshing data due to scan completion: ${job.scanId}`);
    await refreshData();
    
    // Extract image name from job.imageName or fallback to parsing from scan data
    const imageName = job.imageName || 'unknown';
    const scanId = job.scanId;
    
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
    loadData()
  }, [])

  return (
    <AppContext.Provider value={{ state, dispatch, refreshData, handleScanComplete }}>
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