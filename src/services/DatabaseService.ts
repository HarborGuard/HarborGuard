// Comprehensive database service layer
// Centralizes all database operations and provides clean APIs for the frontend

import { prisma } from '@/lib/prisma';
import { prismaToScan, prismaToScanWithImage, prismaToScanWithFullRelations, serializeForJson } from '@/lib/type-utils';
import type {
  Image,
  Scan,
  ScanWithImage,
  ScanWithFullRelations,
  Scanner,
  ScanResult,
  Vulnerability,
  ImageVulnerability,
  VulnerabilityWithImages,
  ImageWithScans,
  CveClassification,
  BulkScanBatch,
  BulkScanItem,
  AuditLog,
  ScanStatus,
  Severity,
  ScannerType,
  CreateScanRequest,
  CreateImageRequest,
  CreateVulnerabilityRequest,
  CreateImageVulnerabilityRequest
} from '@/types';

export class DatabaseService {
  // Image Operations
  async getImages(options?: {
    limit?: number;
    offset?: number;
    includeScans?: boolean;
    includeVulnerabilities?: boolean;
  }): Promise<{ images: Image[] | ImageWithScans[]; total: number }> {
    const { limit = 25, offset = 0, includeScans = false, includeVulnerabilities = false } = options || {};
    
    const include: any = {};
    if (includeScans) include.scans = true;
    if (includeVulnerabilities) {
      include.imageVulnerabilities = {
        include: {
          vulnerability: true
        }
      };
    }

    const [images, total] = await Promise.all([
      prisma.image.findMany({
        skip: offset,
        take: limit,
        include,
        orderBy: { updatedAt: 'desc' }
      }),
      prisma.image.count()
    ]);

    // Serialize images to handle BigInt values
    const serializedImages = images.map(image => serializeForJson(image));

    return { images: serializedImages, total };
  }

  async getImageById(id: string): Promise<ImageWithScans | null> {
    const image = await prisma.image.findUnique({
      where: { id },
      include: {
        scans: {
          orderBy: { createdAt: 'desc' }
        },
        imageVulnerabilities: {
          include: {
            vulnerability: true
          }
        }
      }
    });

    if (!image) return null;

    return {
      ...image,
      scans: image.scans.map(scan => prismaToScan(scan)),
    };
  }

  async getImageByName(name: string, tag?: string): Promise<Image | null> {
    const where = tag ? { name, tag } : { name };
    return await prisma.image.findFirst({
      where,
      orderBy: { createdAt: 'desc' }
    });
  }

  async createImage(data: CreateImageRequest): Promise<Image> {
    return await prisma.image.create({
      data
    });
  }

  async deleteImage(id: string): Promise<void> {
    await prisma.image.delete({
      where: { id }
    });
  }

  // Scan Operations
  async getScans(options?: {
    limit?: number;
    offset?: number;
    includeImage?: boolean;
    includeFullRelations?: boolean;
    status?: ScanStatus;
  }): Promise<{ scans: Scan[] | ScanWithImage[] | ScanWithFullRelations[]; total: number }> {
    const { 
      limit = 25, 
      offset = 0, 
      includeImage = true,
      includeFullRelations = false,
      status 
    } = options || {};
    
    const where = status ? { status } : {};
    const include: any = {};
    
    if (includeImage || includeFullRelations) {
      include.image = true;
    }
    
    if (includeFullRelations) {
      include.scanResults = {
        include: {
          scanner: true
        }
      };
    }

    const [scans, total] = await Promise.all([
      prisma.scan.findMany({
        where,
        skip: offset,
        take: limit,
        include,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.scan.count({ where })
    ]);

    // Convert to appropriate types based on options
    let convertedScans: Scan[] | ScanWithImage[] | ScanWithFullRelations[];
    
    if (includeFullRelations) {
      convertedScans = scans.map(scan => prismaToScanWithFullRelations(scan as any));
    } else if (includeImage) {
      convertedScans = scans.map(scan => prismaToScanWithImage(scan as any));
    } else {
      convertedScans = scans.map(scan => prismaToScan(scan));
    }

    return { scans: convertedScans, total };
  }

  async getScanById(id: string, includeFullRelations = false): Promise<ScanWithFullRelations | ScanWithImage | null> {
    const include: any = {
      image: true
    };
    
    if (includeFullRelations) {
      include.scanResults = {
        include: {
          scanner: true
        }
      };
    }

    const scan = await prisma.scan.findUnique({
      where: { id },
      include
    });

    if (!scan) return null;

    if (includeFullRelations) {
      return prismaToScanWithFullRelations(scan as any);
    } else {
      return prismaToScanWithImage(scan as any);
    }
  }

  async getScanByRequestId(requestId: string): Promise<ScanWithImage | null> {
    const scan = await prisma.scan.findUnique({
      where: { requestId },
      include: {
        image: true
      }
    });

    if (!scan) return null;
    return prismaToScanWithImage(scan as any);
  }

  async createScan(data: {
    requestId: string;
    imageId: string;
    startedAt: Date;
    status?: ScanStatus;
    source?: string;
  }): Promise<Scan> {
    const scan = await prisma.scan.create({
      data
    });
    return prismaToScan(scan);
  }

  async updateScan(id: string, data: Partial<Scan>): Promise<Scan> {
    const scan = await prisma.scan.update({
      where: { id },
      data: data as any // Cast to allow partial updates
    });
    return prismaToScan(scan);
  }

  // Scanner Operations
  async getScanners(): Promise<Scanner[]> {
    return await prisma.scanner.findMany({
      orderBy: { name: 'asc' }
    });
  }

  async getScannerByName(name: string): Promise<Scanner | null> {
    return await prisma.scanner.findUnique({
      where: { name }
    });
  }

  async createScanner(data: {
    name: string;
    version: string;
    type: ScannerType;
    isActive?: boolean;
    defaultConfig?: any;
  }): Promise<Scanner> {
    return await prisma.scanner.create({
      data
    });
  }

  // Scan Result Operations
  async createScanResult(data: {
    scanId: string;
    scannerId: string;
    rawOutput?: any;
    status?: 'SUCCESS' | 'FAILED' | 'PARTIAL';
    errorMessage?: string;
  }): Promise<ScanResult> {
    const result = await prisma.scanResult.create({
      data
    });
    // Convert rawOutput type from JsonValue to ScannerReport
    return {
      ...result,
      rawOutput: result.rawOutput as any
    };
  }

  async getScanResults(scanId: string): Promise<(ScanResult & { scanner: Scanner })[]> {
    const results = await prisma.scanResult.findMany({
      where: { scanId },
      include: {
        scanner: true
      }
    });
    
    // Convert rawOutput type from JsonValue to ScannerReport
    return results.map(result => ({
      ...result,
      rawOutput: result.rawOutput as any
    }));
  }

  // Vulnerability Operations
  async getVulnerabilities(options?: {
    limit?: number;
    offset?: number;
    severity?: Severity;
    includeImages?: boolean;
  }): Promise<{ vulnerabilities: Vulnerability[] | VulnerabilityWithImages[]; total: number }> {
    const { limit = 25, offset = 0, severity, includeImages = false } = options || {};
    
    const where = severity ? { severity } : {};
    const include = includeImages ? {
      imageVulnerabilities: {
        include: {
          image: true
        }
      }
    } : {};

    const [vulnerabilities, total] = await Promise.all([
      prisma.vulnerability.findMany({
        where,
        skip: offset,
        take: limit,
        include,
        orderBy: { cvssScore: 'desc' }
      }),
      prisma.vulnerability.count({ where })
    ]);

    return { vulnerabilities, total };
  }

  async getVulnerabilityByCveId(cveId: string): Promise<Vulnerability | null> {
    return await prisma.vulnerability.findUnique({
      where: { cveId }
    });
  }

  async createVulnerability(data: CreateVulnerabilityRequest): Promise<Vulnerability> {
    return await prisma.vulnerability.create({
      data: {
        ...data,
        publishedAt: data.publishedAt ? new Date(data.publishedAt) : undefined,
        modifiedAt: data.modifiedAt ? new Date(data.modifiedAt) : undefined,
      }
    });
  }

  // Image Vulnerability Operations
  async getImageVulnerabilities(imageId: string): Promise<(ImageVulnerability & { vulnerability: Vulnerability })[]> {
    return await prisma.imageVulnerability.findMany({
      where: { imageId },
      include: {
        vulnerability: true
      },
      orderBy: { vulnerability: { cvssScore: 'desc' } }
    });
  }

  async createImageVulnerability(data: CreateImageVulnerabilityRequest): Promise<ImageVulnerability> {
    return await prisma.imageVulnerability.create({
      data
    });
  }

  // CVE Classification Operations
  async getCveClassifications(imageId?: string): Promise<CveClassification[]> {
    const where = imageId ? { imageId } : {};
    return await prisma.cveClassification.findMany({
      where,
      include: {
        imageVulnerability: {
          include: {
            vulnerability: true
          }
        }
      }
    });
  }

  async createCveClassification(data: {
    imageVulnerabilityId: string;
    imageId: string;
    isFalsePositive: boolean;
    comment?: string;
    createdBy?: string;
  }): Promise<CveClassification> {
    return await prisma.cveClassification.create({
      data
    });
  }


  // Bulk Scan Operations
  async getBulkScans(): Promise<BulkScanBatch[]> {
    return await prisma.bulkScanBatch.findMany({
      include: {
        items: {
          include: {
            image: true,
            scan: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async getBulkScanById(id: string): Promise<BulkScanBatch | null> {
    return await prisma.bulkScanBatch.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            image: true,
            scan: true
          }
        }
      }
    });
  }

  async createBulkScan(data: {
    totalImages: number;
    status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
    patterns: any;
    name?: string;
  }): Promise<BulkScanBatch> {
    return await prisma.bulkScanBatch.create({
      data
    });
  }

  // Audit Log Operations
  async getAuditLogs(options?: {
    limit?: number;
    offset?: number;
    eventType?: string;
    category?: string;
  }): Promise<{ logs: AuditLog[]; total: number }> {
    const { limit = 25, offset = 0, eventType, category } = options || {};
    
    const where: any = {};
    if (eventType) where.eventType = eventType;
    if (category) where.category = category;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: { timestamp: 'desc' }
      }),
      prisma.auditLog.count({ where })
    ]);

    return { logs, total };
  }

  async createAuditLog(data: {
    eventType: string;
    category: string;
    userIp: string;
    userAgent?: string;
    userId?: string;
    resource?: string;
    action: string;
    details?: any;
    metadata?: any;
  }): Promise<AuditLog> {
    return await prisma.auditLog.create({
      data: data as any // Cast to allow string enum values
    });
  }

  // Search Operations
  async searchImages(query: string): Promise<Image[]> {
    return await prisma.image.findMany({
      where: {
        OR: [
          { name: { contains: query } },
          { tag: { contains: query } }
        ]
      },
      take: 10,
      orderBy: { updatedAt: 'desc' }
    });
  }

  async searchVulnerabilities(query: string): Promise<Vulnerability[]> {
    return await prisma.vulnerability.findMany({
      where: {
        OR: [
          { cveId: { contains: query } },
          { title: { contains: query } },
          { description: { contains: query } },
        ]
      },
      take: 10,
      orderBy: { cvssScore: 'desc' }
    });
  }

  // Dashboard/Stats Operations
  async getDashboardStats(): Promise<{
    totalImages: number;
    totalScans: number;
    totalVulnerabilities: number;
    recentScans: ScanWithImage[];
    criticalVulnerabilities: number;
  }> {
    const [
      totalImages,
      totalScans,
      totalVulnerabilities,
      recentScans,
      criticalVulnerabilities
    ] = await Promise.all([
      prisma.image.count(),
      prisma.scan.count(),
      prisma.vulnerability.count(),
      prisma.scan.findMany({
        take: 5,
        include: { image: true },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.vulnerability.count({
        where: { severity: 'CRITICAL' }
      })
    ]);

    return {
      totalImages,
      totalScans,
      totalVulnerabilities,
      recentScans: recentScans.map(scan => prismaToScanWithImage(scan as any)),
      criticalVulnerabilities
    };
  }

  // Cleanup Operations
  async cleanupOldData(retentionDays: number = 30): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    // Delete old audit logs
    await prisma.auditLog.deleteMany({
      where: {
        timestamp: {
          lt: cutoffDate
        }
      }
    });

    // Delete old completed bulk scans
    await prisma.bulkScanBatch.deleteMany({
      where: {
        status: 'COMPLETED',
        completedAt: {
          lt: cutoffDate
        }
      }
    });
  }
}

// Export singleton instance
export const databaseService = new DatabaseService();