// Utility functions to convert between Prisma types and UI types
// This provides a clean migration path from legacy types to Prisma types

import type { 
  Image as PrismaImage,
  Scan as PrismaScan,
  ScanResult as PrismaScanResult,
  Scanner as PrismaScanner,
  Vulnerability as PrismaVulnerability,
  ImageVulnerability as PrismaImageVulnerability,
  ScanMetadata as PrismaScanMetadata,
  ScanStatus,
  Severity
} from '@/generated/prisma';
import type { 
  Scan,
  ScanWithImage,
  ScanWithFullRelations,
  LegacyScan,
  VulnerabilityCount,
  ComplianceScore,
  ScannerReport,
  ImageMetadata 
} from '@/types';

/**
 * Convert Prisma Scan to UI Scan with proper type handling
 */
export function prismaToScan(prismaData: PrismaScan & { metadata?: PrismaScanMetadata | null }): Scan {
  return {
    ...prismaData,
    metadata: prismaData.metadata as unknown as ImageMetadata | undefined,
  };
}

/**
 * Convert Prisma Scan with Image relation to ScanWithImage
 */
export function prismaToScanWithImage(prismaData: PrismaScan & { 
  image: PrismaImage;
  metadata?: PrismaScanMetadata | null;
  scanResults?: (PrismaScanResult & { scanner: PrismaScanner })[];
}): ScanWithImage {
  return {
    ...prismaData,
    image: prismaData.image,
    metadata: prismaData.metadata as unknown as ImageMetadata | undefined,
  };
}

/**
 * Convert Prisma data to ScanWithFullRelations
 */
export function prismaToScanWithFullRelations(prismaData: PrismaScan & { 
  image: PrismaImage;
  metadata?: PrismaScanMetadata | null;
  scanResults: (PrismaScanResult & { scanner: PrismaScanner })[];
}): ScanWithFullRelations {
  return {
    ...prismaData,
    image: prismaData.image,
    scanResults: prismaData.scanResults.map(result => ({
      ...result,
      rawOutput: result.rawOutput as unknown as ScannerReport | undefined,
    })),
    metadata: prismaData.metadata as unknown as ImageMetadata | undefined,
  };
}

/**
 * Extract scanner reports from scan results
 */
export function extractScannerReports(scanResults: (PrismaScanResult & { scanner: PrismaScanner })[]): {
  trivy?: any;
  grype?: any;
  syft?: any;
  dockle?: any;
  osv?: any;
  dive?: any;
  metadata?: any;
} {
  const reports: any = {};
  
  for (const result of scanResults) {
    const scannerName = result.scanner.name.toLowerCase();
    reports[scannerName] = result.rawOutput;
  }
  
  return reports;
}

/**
 * Calculate vulnerability counts from image vulnerabilities
 */
export function calculateVulnerabilityCount(
  imageVulnerabilities: (PrismaImageVulnerability & { vulnerability: PrismaVulnerability })[]
): VulnerabilityCount {
  const counts = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0
  };
  
  for (const imageVuln of imageVulnerabilities) {
    const severity = imageVuln.vulnerability.severity.toLowerCase();
    if (severity in counts) {
      (counts as any)[severity]++;
    }
  }
  
  return counts;
}

/**
 * Convert modern Scan to Legacy Scan format for UI compatibility
 */
export function scanToLegacyScan(scan: ScanWithImage, vulnCount?: VulnerabilityCount): LegacyScan {
  // Use provided vulnerability count or default to zeros
  const vulnerabilities = vulnCount || { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  
  return {
    // Map new fields to legacy fields
    id: parseInt(scan.id.slice(-8), 16), // Convert cuid to number-like ID
    uid: scan.requestId,
    image: scan.image?.name || 'unknown',
    digestShort: scan.image?.digest?.slice(7, 19) || '', // First 12 chars after "sha256:"
    platform: scan.image?.platform || 'unknown',
    sizeMb: scan.image?.sizeBytes ? Math.round(Number(scan.image.sizeBytes) / 1024 / 1024) : 0,
    riskScore: scan.riskScore || 0,
    
    // Map vulnerability counts
    severities: {
      crit: vulnerabilities.critical,
      high: vulnerabilities.high,
      med: vulnerabilities.medium,
      low: vulnerabilities.low,
    },
    
    
    highestCvss: 0, // Would need to extract from scanner reports
    misconfigs: 0, // Would need to extract from scanner reports  
    secrets: 0, // Would need to extract from scanner reports
    
    // Map compliance scores (would need to extract from scan results)
    compliance: {
      dockle: undefined,
    },
    
    policy: "Pass", // Default placeholder
    
    delta: {
      newCrit: 0,
      resolvedTotal: 0
    },
    
    inUse: {
      clusters: 0,
      pods: 0
    },
    
    baseImage: extractBaseImage(scan.image?.name),
    baseUpdate: undefined,
    signed: false,
    imageId: scan.imageId, // or derive from scan
    imageName: extractBaseImage(scan.image?.name) || "",
    attested: false,
    sbomFormat: "spdx",
    dbAge: "0h",
    registry: undefined,
    project: undefined,
    lastScan: scan.finishedAt?.toISOString() || scan.createdAt.toISOString(),
    status: mapScanStatus(scan.status),
    header: undefined,
    type: undefined,
    target: undefined,
    limit: undefined,
    
    // Pass through scanner reports (would need to extract from scan results)
    scannerReports: undefined,
    
    // Additional fields
    digest: scan.image?.digest,
    layers: [], // Would need to extract from metadata
    osInfo: undefined, // Would need to extract from scan results
  };
}

/**
 * Convert array of Prisma scans to legacy scans
 */
export function scansToLegacyScans(scans: ScanWithImage[], vulnCounts?: VulnerabilityCount[]): LegacyScan[] {
  return scans.map((scan, index) => scanToLegacyScan(scan, vulnCounts?.[index]));
}

/**
 * Serialize scan for JSON response (handle BigInt)
 */
export function serializeScan(scan: any): any {
  return JSON.parse(JSON.stringify(scan, (key, value) =>
    typeof value === 'bigint' ? value.toString() : value
  ));
}

/**
 * Serialize any data structure for JSON response (handle BigInt)
 */
export function serializeForJson(data: any): any {
  return JSON.parse(JSON.stringify(data, (key, value) =>
    typeof value === 'bigint' ? value.toString() : value
  ));
}

// Helper functions
function extractBaseImage(imageName?: string): string | undefined {
  if (!imageName) return undefined;
  
  // Extract base image from common patterns
  if (imageName.includes('node')) return 'node';
  if (imageName.includes('python')) return 'python';
  if (imageName.includes('nginx')) return 'nginx';
  if (imageName.includes('alpine')) return 'alpine';
  if (imageName.includes('ubuntu')) return 'ubuntu';
  if (imageName.includes('debian')) return 'debian';
  
  return imageName.split(':')[0];
}

function mapScanStatus(status: string): "Complete" | "Queued" | "Error" | "Prior" {
  switch (status) {
    case 'SUCCESS': return 'Complete';
    case 'RUNNING': return 'Queued';
    case 'FAILED': return 'Error';
    case 'PARTIAL': return 'Complete';
    case 'CANCELLED': return 'Error';
    default: return 'Prior';
  }
}

// Helper function to extract OS info from scan results
export function extractOsInfo(scanResults: (PrismaScanResult & { scanner: PrismaScanner })[]): { family: string; name: string } | undefined {
  const trivyResult = scanResults.find(result => result.scanner.name.toLowerCase() === 'trivy');
  const trivyReport = trivyResult?.rawOutput as any; // Cast to avoid JsonValue restriction
  if (trivyReport?.Metadata?.OS) {
    return {
      family: trivyReport.Metadata.OS.Family,
      name: trivyReport.Metadata.OS.Name,
    };
  }
  return undefined;
}

/**
 * Type guard to check if data is a Prisma Scan
 */
export function isPrismaScan(data: any): data is PrismaScan {
  return data && typeof data.id === 'string' && data.requestId && data.createdAt;
}

/**
 * Type guard to check if data is a Legacy Scan
 */
export function isLegacyScan(data: any): data is LegacyScan {
  return data && typeof data.id === 'number' && data.uid && data.lastScan;
}