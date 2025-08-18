import { 
  IconTrendingDown, 
  IconTrendingUp, 
  IconShield,
  IconAlertTriangle,
  IconEye,
  IconChecks
} from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

interface SectionCardsProps {
  scanData: Array<{
    id: number
    riskScore: number
    severities: {
      crit: number
      high: number
      med: number
      low: number
    }
    fixable: {
      count: number
      percent: number
    }
    status: string
    misconfigs: number
    secrets: number
    policy?: string
    osvPackages?: number
    osvVulnerable?: number
    osvEcosystems?: string[]
  }>
  stats: {
    totalScans: number
    vulnerabilities: {
      critical: number
      high: number
      medium: number
      low: number
      total: number
    }
    avgRiskScore: number
    blockedScans: number
    completeScans: number
    completionRate: number
  }
}

export function SectionCards({ scanData, stats }: SectionCardsProps) {
  // Use aggregated stats for unique vulnerability counts
  const totalImages = stats.totalScans
  const completedScans = stats.completeScans
  const averageRiskScore = stats.avgRiskScore
  
  // Use unique vulnerability counts from stats instead of summing duplicates
  const totalCriticalVulns = stats.vulnerabilities.critical
  const totalHighVulns = stats.vulnerabilities.high
  const totalVulns = stats.vulnerabilities.total
  
  const totalFixableVulns = scanData.reduce((sum, item) => sum + item.fixable.count, 0)
  const averageFixablePercent = totalImages > 0 
    ? Math.round(scanData.reduce((sum, item) => sum + item.fixable.percent, 0) / totalImages)
    : 0
  
  const totalMisconfigs = scanData.reduce((sum, item) => sum + item.misconfigs, 0)
  const totalSecrets = scanData.reduce((sum, item) => sum + item.secrets, 0)
  
  // OSV metrics
  const totalOSVPackages = scanData.reduce((sum, item) => sum + (item.osvPackages || 0), 0)
  const totalOSVVulnerable = scanData.reduce((sum, item) => sum + (item.osvVulnerable || 0), 0)
  const uniqueEcosystems = new Set(scanData.flatMap(item => item.osvEcosystems || [])).size
  
  
  const riskTrend = averageRiskScore > 50 ? "high" : averageRiskScore > 30 ? "medium" : "low"
  const criticalTrend = totalCriticalVulns > 5 ? "up" : "down"

  return (
    <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Total Images Scanned</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {totalImages}
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <IconChecks />
              {completedScans} Complete
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            {completedScans} of {totalImages} scans completed <IconChecks className="size-4" />
          </div>
          <div className="text-muted-foreground">
            Active security monitoring
          </div>
        </CardFooter>
      </Card>
      
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Average Risk Score</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {averageRiskScore}
          </CardTitle>
          <CardAction>
            <Badge variant={riskTrend === "high" ? "destructive" : riskTrend === "medium" ? "secondary" : "default"}>
              <IconShield />
              {riskTrend === "high" ? "High Risk" : riskTrend === "medium" ? "Medium Risk" : "Low Risk"}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            {riskTrend === "high" ? "Requires attention" : riskTrend === "medium" ? "Monitor closely" : "Good security posture"} <IconShield className="size-4" />
          </div>
          <div className="text-muted-foreground">
            Overall security risk assessment
          </div>
        </CardFooter>
      </Card>
      
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Critical + High Vulnerabilities</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {totalCriticalVulns + totalHighVulns}
          </CardTitle>
          <CardAction>
            <Badge variant={totalCriticalVulns > 0 ? "destructive" : "outline"}>
              {criticalTrend === "up" ? <IconTrendingUp /> : <IconTrendingDown />}
              {totalCriticalVulns} Critical
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            {totalCriticalVulns > 0 ? "Immediate action needed" : "No critical issues"} <IconAlertTriangle className="size-4" />
          </div>
          <div className="text-muted-foreground">
            {totalFixableVulns} fixable ({averageFixablePercent}% avg)
          </div>
        </CardFooter>
      </Card>
      
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Security Issues</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {totalMisconfigs + totalSecrets}
          </CardTitle>
          <CardAction>
            <Badge variant={totalSecrets > 0 ? "destructive" : "outline"}>
              <IconEye />
              {totalSecrets} Secrets
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            {totalMisconfigs} misconfigurations detected <IconAlertTriangle className="size-4" />
          </div>
          <div className="text-muted-foreground">
            {totalOSVPackages > 0 ? `${totalOSVVulnerable} of ${totalOSVPackages} packages vulnerable` : `${totalFixableVulns} vulnerabilities can be fixed`}
          </div>
        </CardFooter>
      </Card>
    </div>
  )
}
