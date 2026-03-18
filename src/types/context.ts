// Context type definitions for React providers

import type { Image, BulkScanBatch } from './prisma';
import type { VulnerabilityWithImages } from './domain';

// Database Provider Types
export interface DatabaseContextType {
  // Images
  images: Image[];
  imagesLoading: boolean;
  imagesError: string | null;

  // Vulnerabilities
  vulnerabilities: VulnerabilityWithImages[];
  vulnerabilitiesLoading: boolean;
  vulnerabilitiesError: string | null;

  // Bulk Scans
  bulkScans: BulkScanBatch[];
  bulkScansLoading: boolean;
  bulkScansError: string | null;

  // Actions
  refreshAll: () => Promise<void>;
  refreshImages: () => Promise<void>;
  refreshVulnerabilities: () => Promise<void>;
  refreshBulkScans: () => Promise<void>;
}
