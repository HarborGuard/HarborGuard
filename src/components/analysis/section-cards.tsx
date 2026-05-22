import {
  TrendingDown,
  TrendingUp,
  Shield,
  AlertTriangle,
  Eye,
  CheckCheck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface SectionCardsProps {
  loading?: boolean;
  scanData: Array<{
    id: number;
    riskScore: number;
    severities: {
      crit: number;
      high: number;
      med: number;
      low: number;
    };
    status: string;
    misconfigs: number;
    secrets: number;
    policy?: string;
    osvPackages?: number;
    osvVulnerable?: number;
    osvEcosystems?: string[];
  }>;
  stats: {
    totalScans: number;
    uniqueImageTags?: number;
    uniqueImages?: number;
    vulnerabilities: {
      critical: number;
      high: number;
      medium: number;
      low: number;
      total: number;
    };
    avgRiskScore: number;
    blockedScans: number;
    completeScans: number;
    completionRate: number;
  };
}

export function SectionCards({
  loading = false,
  scanData,
  stats,
}: SectionCardsProps) {
  // Use unique image:tag count for "Images Scanned"
  const totalImages = stats.uniqueImageTags || stats.totalScans;
  const completedScans = stats.completeScans;
  const totalScans = stats.totalScans;
  const averageRiskScore = stats.avgRiskScore;

  // Use unique vulnerability counts from stats (already deduplicated per image)
  const totalCriticalVulns = stats.vulnerabilities.critical;
  const totalHighVulns = stats.vulnerabilities.high;
  const totalVulns = stats.vulnerabilities.total;

  const totalMisconfigs = scanData.reduce(
    (sum, item) => sum + item.misconfigs,
    0
  );
  const totalSecrets = scanData.reduce((sum, item) => sum + item.secrets, 0);

  // OSV metrics
  const totalOSVPackages = scanData.reduce(
    (sum, item) => sum + (item.osvPackages || 0),
    0
  );
  const totalOSVVulnerable = scanData.reduce(
    (sum, item) => sum + (item.osvVulnerable || 0),
    0
  );
  const uniqueEcosystems = new Set(
    scanData.flatMap((item) => item.osvEcosystems || [])
  ).size;

  const riskTrend =
    averageRiskScore > 50 ? "high" : averageRiskScore > 30 ? "medium" : "low";
  const criticalTrend = totalCriticalVulns > 5 ? "up" : "down";

  // Loading state - show skeleton cards matching the actual card design
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
        {/* Total Images Scanned Skeleton */}
        <Card className="@container/card bg-surface-1 border-white/10 rounded-none">
          <CardHeader>
            <CardDescription>Total Images Scanned</CardDescription>
            <Skeleton className="h-8 w-16 @[250px]/card:h-10" />
            <CardAction>
              <Skeleton className="h-6 w-24" />
            </CardAction>
          </CardHeader>
          <CardFooter className="flex-col items-start gap-1.5 text-sm">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-28" />
          </CardFooter>
        </Card>

        {/* Average Risk Score Skeleton */}
        <Card className="@container/card bg-surface-1 border-white/10 rounded-none">
          <CardHeader>
            <CardDescription>Average Risk Score</CardDescription>
            <Skeleton className="h-8 w-12 @[250px]/card:h-10" />
            <CardAction>
              <Skeleton className="h-6 w-20" />
            </CardAction>
          </CardHeader>
          <CardFooter className="flex-col items-start gap-1.5 text-sm">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-32" />
          </CardFooter>
        </Card>

        {/* Critical Vulnerabilities Skeleton */}
        <Card className="@container/card bg-surface-1 border-white/10 rounded-none">
          <CardHeader>
            <CardDescription>Critical Vulnerabilities</CardDescription>
            <Skeleton className="h-8 w-12 @[250px]/card:h-10" />
            <CardAction>
              <Skeleton className="h-6 w-16" />
            </CardAction>
          </CardHeader>
          <CardFooter className="flex-col items-start gap-1.5 text-sm">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-28" />
          </CardFooter>
        </Card>

        {/* High Vulnerabilities Skeleton */}
        <Card className="@container/card bg-surface-1 border-white/10 rounded-none">
          <CardHeader>
            <CardDescription>High Vulnerabilities</CardDescription>
            <Skeleton className="h-8 w-12 @[250px]/card:h-10" />
            <CardAction>
              <Skeleton className="h-6 w-16" />
            </CardAction>
          </CardHeader>
          <CardFooter className="flex-col items-start gap-1.5 text-sm">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-28" />
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      <Card className="@container/card bg-surface-1 border-white/10 rounded-none">
        <CardHeader>
          <CardDescription className="uppercase tracking-widest text-caption text-muted-foreground/60">Total Images Scanned</CardDescription>
          <CardTitle className="text-2xl tracking-tight tabular-nums @[250px]/card:text-3xl text-foreground">
            {totalImages}
          </CardTitle>
          <CardAction>
            <Badge variant="outline" className="rounded-none border-white/20 text-muted-foreground uppercase tracking-widest text-caption">
              <CheckCheck className="h-3 w-3 mr-1" />
              {completedScans} Complete
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 text-body-sm uppercase tracking-caps">
            {completedScans} of {totalScans} scans completed{" "}
            <CheckCheck className="h-4 w-4" />
          </div>
          <div className="text-caption uppercase tracking-widest text-muted-foreground/50">
            Active security monitoring
          </div>
        </CardFooter>
      </Card>

      <Card className="@container/card bg-surface-1 border-white/10 rounded-none">
        <CardHeader>
          <CardDescription className="uppercase tracking-widest text-caption text-muted-foreground/60">Average Risk Score</CardDescription>
          <CardTitle className="text-2xl tracking-tight tabular-nums @[250px]/card:text-3xl text-foreground">
            {averageRiskScore}
          </CardTitle>
          <CardAction>
            <Badge
              variant={
                riskTrend === "high"
                  ? "destructive"
                  : riskTrend === "medium"
                  ? "secondary"
                  : "default"
              }
              className="rounded-none uppercase tracking-widest text-caption"
            >
              <Shield className="h-3 w-3 mr-1" />
              {riskTrend === "high"
                ? "High Risk"
                : riskTrend === "medium"
                ? "Medium Risk"
                : "Low Risk"}
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 text-body-sm uppercase tracking-caps">
            {riskTrend === "high"
              ? "Requires attention"
              : riskTrend === "medium"
              ? "Monitor closely"
              : "Good security posture"}{" "}
            <Shield className="h-4 w-4" />
          </div>
          <div className="text-caption uppercase tracking-widest text-muted-foreground/50">
            Overall security risk assessment
          </div>
        </CardFooter>
      </Card>

      <Card className="@container/card bg-surface-1 border-white/10 rounded-none">
        <CardHeader>
          <CardDescription className="uppercase tracking-widest text-caption text-muted-foreground/60">Critical + High Vulnerabilities</CardDescription>
          <CardTitle className="text-2xl tracking-tight tabular-nums @[250px]/card:text-3xl text-foreground">
            {totalCriticalVulns + totalHighVulns}
          </CardTitle>
          <CardAction>
            <Badge variant={totalCriticalVulns > 0 ? "destructive" : "outline"} className="rounded-none uppercase tracking-widest text-caption">
              {criticalTrend === "up" ? (
                <TrendingUp className="h-3 w-3 mr-1" />
              ) : (
                <TrendingDown className="h-3 w-3 mr-1" />
              )}
              {totalCriticalVulns} Critical
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 text-body-sm uppercase tracking-caps">
            {totalCriticalVulns > 0
              ? "Immediate action needed"
              : "No critical issues"}{" "}
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div className="text-caption uppercase tracking-widest text-muted-foreground/50">
            View details for breakdown
          </div>
        </CardFooter>
      </Card>

      <Card className="@container/card bg-surface-1 border-white/10 rounded-none">
        <CardHeader>
          <CardDescription className="uppercase tracking-widest text-caption text-muted-foreground/60">Security Issues</CardDescription>
          <CardTitle className="text-2xl tracking-tight tabular-nums @[250px]/card:text-3xl text-foreground">
            {totalMisconfigs + totalSecrets}
          </CardTitle>
          <CardAction>
            <Badge variant={totalSecrets > 0 ? "destructive" : "outline"} className="rounded-none uppercase tracking-widest text-caption">
              <Eye className="h-3 w-3 mr-1" />
              {totalSecrets} Secrets
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 text-body-sm uppercase tracking-caps">
            {totalMisconfigs} misconfigurations detected{" "}
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div className="text-caption uppercase tracking-widest text-muted-foreground/50">
            {totalOSVPackages > 0
              ? `${totalOSVVulnerable} of ${totalOSVPackages} packages vulnerable`
              : `View details for breakdown`}
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
