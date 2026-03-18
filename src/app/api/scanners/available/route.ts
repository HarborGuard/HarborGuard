import { NextResponse } from 'next/server';
import { config } from '@/lib/config';
import type { ScannerInfo } from '@/types';
import { apiError } from '@/lib/api/api-utils';

// Define all available scanners with descriptions
const ALL_SCANNERS: ScannerInfo[] = [
  { name: 'trivy', description: 'Comprehensive vulnerability scanner', available: false },
  { name: 'grype', description: 'Vulnerability scanner by Anchore', available: false },
  { name: 'syft', description: 'SBOM generator', available: false },
  { name: 'dockle', description: 'Container linter for best practices', available: false },
  { name: 'osv', description: 'OSV vulnerability database scanner', available: false },
  { name: 'dive', description: 'Layer analysis and image efficiency', available: false },
];

export async function GET() {
  try {
    // Get enabled scanners from configuration
    const enabledScanners = config.enabledScanners;
    
    // Map scanner availability
    const scanners = ALL_SCANNERS.map(scanner => ({
      ...scanner,
      available: enabledScanners.includes(scanner.name)
    }));
    
    return NextResponse.json({
      success: true,
      scanners
    });
  } catch (error) {
    return apiError(error, 'Failed to fetch scanner availability');
  }
}