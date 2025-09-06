import { useApp } from '@/contexts/AppContext'
import { useMemo } from 'react'
import { calculateDashboardStats, aggregateUniqueVulnerabilities } from '@/lib/scan-aggregations'

export function useScans() {
  const { state, dispatch } = useApp()
  
  const scans = state.scans
  const loading = state.loading
  const dataReceived = state.dataReceived
  const dataReady = state.dataReady
  const error = state.error

  const stats = useMemo(() => {
    const totalScans = scans.length
    
    // Count unique image:tag combinations
    const uniqueImageTags = new Set(scans.map(scan => {
      // Handle both string and object formats
      return typeof scan.image === 'string' 
        ? scan.image 
        : `${(scan.image as any)?.name}:${(scan.image as any)?.tag}`
    })).size
    
    // Group scans by image name (without tag) to get latest scan per image
    const imageGroups = new Map<string, any>()
    scans.forEach(scan => {
      // Handle both string and object formats for scan.image
      const imageName = scan.image 
        ? (typeof scan.image === 'string' 
            ? scan.image.split(':')[0] 
            : (scan.image as any).name)
        : 'unknown'
      // Keep only the most recent scan for each image
      if (!imageGroups.has(imageName) || 
          new Date(scan.lastScan) > new Date(imageGroups.get(imageName).lastScan)) {
        imageGroups.set(imageName, scan)
      }
    })
    
    // Aggregate vulnerabilities from the most recent scan of each unique image
    const aggregatedVulns = Array.from(imageGroups.values()).reduce((acc, scan) => ({
      critical: acc.critical + (scan.severities?.crit || 0),
      high: acc.high + (scan.severities?.high || 0),
      medium: acc.medium + (scan.severities?.med || 0),
      low: acc.low + (scan.severities?.low || 0)
    }), { critical: 0, high: 0, medium: 0, low: 0 })
    
    const totalVulns = aggregatedVulns.critical + aggregatedVulns.high + aggregatedVulns.medium + aggregatedVulns.low
    
    const avgRiskScore = scans.length > 0 
      ? scans.reduce((sum, scan) => sum + scan.riskScore, 0) / scans.length 
      : 0

    const blockedScans = scans.filter(scan => scan.policy === 'Blocked').length
    const completeScans = scans.filter(scan => scan.status === 'Complete').length

    return {
      totalScans,
      uniqueImageTags,
      uniqueImages: imageGroups.size,
      vulnerabilities: {
        critical: aggregatedVulns.critical,
        high: aggregatedVulns.high,
        medium: aggregatedVulns.medium,
        low: aggregatedVulns.low,
        total: totalVulns
      },
      avgRiskScore: Math.round(avgRiskScore),
      blockedScans,
      completeScans,
      completionRate: totalScans > 0 ? Math.round((completeScans / totalScans) * 100) : 0
    }
  }, [scans])

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
    dataReceived,
    dataReady,
    error,
    stats,
    getScansByRiskLevel,
    getScanById,
    updateScan,
    addScan,
    deleteScan
  }
}