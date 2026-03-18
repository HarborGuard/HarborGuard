// Prisma re-exports — canonical database types and enums

import type {
  Image as PrismaImage,
  Scan as PrismaScan,
  ScanResult as PrismaScanResult,
  Scanner as PrismaScanner,
  BulkScanBatch as PrismaBulkScanBatch,
  BulkScanItem as PrismaBulkScanItem,
  Vulnerability as PrismaVulnerability,
  ImageVulnerability as PrismaImageVulnerability,
  CveClassification as PrismaCveClassification,
  AuditLog as PrismaAuditLog,
  ScanStatus,
  ScanResultStatus,
  ScannerType,
  BatchStatus,
  ItemStatus,
  Severity,
  VulnerabilityStatus,
  EventType,
  LogCategory,
  LogAction
} from '@/generated/prisma';

import type { ImageMetadata, ScannerReport } from './scanner';

// Re-export Prisma enums as canonical types
export type {
  ScanStatus,
  ScanResultStatus,
  ScannerType,
  BatchStatus,
  ItemStatus,
  Severity,
  VulnerabilityStatus,
  EventType,
  LogCategory,
  LogAction
};

// Core database types with proper JSON field typing
export type Image = PrismaImage;
export type Scanner = PrismaScanner;
export type BulkScanBatch = PrismaBulkScanBatch;
export type BulkScanItem = PrismaBulkScanItem;
export type Vulnerability = PrismaVulnerability;
export type ImageVulnerability = PrismaImageVulnerability;
export type CveClassification = PrismaCveClassification;
export type AuditLog = PrismaAuditLog;

// Enhanced types with proper JSON field typing
export type Scan = Omit<PrismaScan, 'metadata'> & {
  metadata?: ImageMetadata;
};

export type ScanResult = Omit<PrismaScanResult, 'rawOutput'> & {
  rawOutput?: ScannerReport;
};
