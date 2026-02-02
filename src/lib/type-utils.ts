// Utility functions to convert between Prisma types and UI types

import type {
  Image as PrismaImage,
  Scan as PrismaScan,
  ScanResult as PrismaScanResult,
  Scanner as PrismaScanner,
  ScanMetadata as PrismaScanMetadata,
} from '@/generated/prisma';
import type {
  ScanWithImage,
  ImageMetadata
} from '@/types';

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
