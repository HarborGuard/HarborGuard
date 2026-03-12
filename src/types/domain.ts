// Core business/domain types — relationships and aggregated data

import type { Scan, ScanResult, Scanner, Image, Vulnerability, ImageVulnerability } from './prisma';

// Comprehensive types with relations for API responses
export type ScanWithImage = Scan & {
  image: Image;
};

export type ScanWithFullRelations = Scan & {
  image: Image;
  scanResults: (ScanResult & { scanner: Scanner })[];
};

export type ImageWithScans = Image & {
  scans: Scan[];
  imageVulnerabilities: (ImageVulnerability & { vulnerability: Vulnerability })[];
};

export type VulnerabilityWithImages = Vulnerability & {
  imageVulnerabilities: (ImageVulnerability & { image: Image })[];
};

// Aggregated Data Types
export interface VulnerabilityCount {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

export interface ComplianceScore {
  dockle?: {
    score: number;
    grade: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
    fatal: number;
    warn: number;
    info: number;
    pass: number;
  };
}
