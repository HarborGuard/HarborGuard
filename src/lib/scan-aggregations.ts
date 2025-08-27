// TEMPORARY STUB FILE - All functions disabled to get build passing
// Original file backed up as scan-aggregations-backup.ts
// TODO: Systematically reimplement these functions to work with the new schema

import type { 
  Scan, 
  ScanWithImage, 
  VulnerabilityCount,
  ComplianceScore,
  CveClassification 
} from '@/types';
// Note: This file is used on the client side, so Prisma imports are not allowed

/**
 * STUB: Aggregate vulnerability data from scanner reports
 * TODO: Update to work with new schema - get from ImageVulnerability table
 */
export function aggregateVulnerabilities(scan: Scan): VulnerabilityCount {
  return {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };
}

/**
 * STUB: Calculate risk score from vulnerability counts
 * TODO: Update to work with new schema
 */
export function calculateRiskScore(scan: Scan): number {
  return scan.riskScore || 0;
}

/**
 * STUB: Aggregate vulnerability data with false positive filtering
 * TODO: Update to work with new schema
 */
export function aggregateVulnerabilitiesWithClassifications(
  scan: Scan, 
  classifications: CveClassification[]
): VulnerabilityCount {
  return aggregateVulnerabilities(scan);
}

/**
 * STUB: Aggregate compliance score from Dockle reports
 * TODO: Update to work with new schema - get from ScanResult table
 */
export function aggregateCompliance(scan: Scan): ComplianceScore {
  return {
    dockle: {
      score: 0,
      grade: 'F' as const,
      fatal: 0,
      warn: 0,
      info: 0,
      pass: 0,
    }
  };
}


/**
 * STUB: Get highest CVSS score from vulnerabilities
 * TODO: Update to work with new schema
 */
export function getHighestCVSS(scan: Scan): number {
  return 0;
}

/**
 * STUB: Count misconfiguration issues
 * TODO: Update to work with new schema
 */
export function countMisconfigurations(scan: Scan): number {
  return 0;
}

/**
 * STUB: Count secret detection findings
 * TODO: Update to work with new schema
 */
export function countSecrets(scan: Scan): number {
  return 0;
}

/**
 * STUB: Get OSV package statistics
 * TODO: Update to work with new schema
 */
export function getOSVPackageStats(scan: Scan): {
  totalPackages: number;
  vulnerablePackages: number;
  ecosystemCounts: Record<string, number>;
} {
  return {
    totalPackages: 0,
    vulnerablePackages: 0,
    ecosystemCounts: {},
  };
}

/**
 * STUB: Count OSV vulnerabilities
 * TODO: Update to work with new schema
 */
export function countOSVVulnerabilities(scan: Scan): number {
  return 0;
}

/**
 * STUB: Calculate scan duration
 * TODO: Update to work with new schema
 */
export function calculateScanDuration(scan: Scan): string {
  if (scan.finishedAt && scan.startedAt) {
    const start = typeof scan.startedAt === 'string' ? new Date(scan.startedAt) : scan.startedAt;
    const end = typeof scan.finishedAt === 'string' ? new Date(scan.finishedAt) : scan.finishedAt;
    const duration = end.getTime() - start.getTime();
    const seconds = Math.floor(duration / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
  return 'Unknown';
}

// Note: Server-side functions that require Prisma have been moved to scan-aggregations-server.ts

/**
 * STUB: Aggregate unique vulnerabilities from legacy scan format
 * TODO: Update to work with new schema
 */
export function aggregateUniqueVulnerabilities(scan: Scan): any[] {
  return [];
}

/**
 * STUB: Aggregate unique vulnerabilities from legacy scans format (required by data-table)
 * TODO: Update to work with new schema
 */
export function aggregateUniqueVulnerabilitiesFromLegacyScans(scans: any[]): VulnerabilityCount {
  return {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };
}

/**
 * STUB: Calculate dashboard statistics
 * TODO: Update to work with new schema
 */
export function calculateDashboardStats(scans: any[]): any {
  return {
    totalImages: scans.length,
    totalVulnerabilities: 0,
    avgRiskScore: 0,
    highRiskImages: 0,
  };
}