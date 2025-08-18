import { useApp } from '@/contexts/AppContext'
import { useMemo } from 'react'
import { calculateDashboardStats, aggregateUniqueVulnerabilities } from '@/lib/scan-aggregations'

export function useScans() {
  const { state, dispatch } = useApp()
  
  const scans = state.scans
  const loading = state.loading
  const error = state.error

  const stats = useMemo(() => {
    // Use unique CVE aggregation to prevent double-counting when same image is scanned multiple times
    const totalScans = scans.length
    const uniqueVulns = aggregateUniqueVulnerabilities(state.rawScans)
    const totalVulns = uniqueVulns.critical + uniqueVulns.high + uniqueVulns.medium + uniqueVulns.low
    
    const avgRiskScore = scans.length > 0 
      ? scans.reduce((sum, scan) => sum + scan.riskScore, 0) / scans.length 
      : 0

    const blockedScans = scans.filter(scan => scan.policy === 'Blocked').length
    const completeScans = scans.filter(scan => scan.status === 'Complete').length

    return {
      totalScans,
      vulnerabilities: {
        critical: uniqueVulns.critical,
        high: uniqueVulns.high,
        medium: uniqueVulns.medium,
        low: uniqueVulns.low,
        total: totalVulns
      },
      avgRiskScore: Math.round(avgRiskScore),
      blockedScans,
      completeScans,
      completionRate: totalScans > 0 ? Math.round((completeScans / totalScans) * 100) : 0
    }
  }, [scans, state.rawScans])

  const getScansByRiskLevel = (level: 'low' | 'medium' | 'high' | 'critical') => {
    const thresholds = {
      low: [0, 25],
      medium: [25, 50], 
      high: [50, 75],
      critical: [75, 100]
    }
    
    const [min, max] = thresholds[level]
    return scans.filter(scan => scan.riskScore >= min && scan.riskScore < max)
  }

  const getScanById = (id: number) => {
    return scans.find(scan => scan.id === id)
  }

  const updateScan = (updatedScan: typeof scans[0]) => {
    dispatch({ type: 'UPDATE_SCAN', payload: updatedScan })
  }

  const addScan = (newScan: typeof scans[0]) => {
    dispatch({ type: 'ADD_SCAN', payload: newScan })
  }

  const deleteScan = (id: number) => {
    dispatch({ type: 'DELETE_SCAN', payload: id })
  }

  return {
    scans,
    loading,
    error,
    stats,
    getScansByRiskLevel,
    getScanById,
    updateScan,
    addScan,
    deleteScan
  }
}