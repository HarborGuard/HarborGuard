import { prisma } from '@/lib/prisma';
import { scannerService } from '@/lib/scanner';
import type { ScanRequest } from '@/types';

export interface BulkScanResult {
  batchId: string;
  totalImages: number;
  scanIds: string[];
  skipped: number;
}

export interface BulkScanRequest {
  patterns: {
    imagePattern?: string;
    tagPattern?: string;
    registryPattern?: string;
    excludeTagPattern?: string;
  };
  options?: {
    maxImages?: number;
    scanners?: {
      trivy?: boolean;
      grype?: boolean;
      syft?: boolean;
      dockle?: boolean;
      osv?: boolean;
      dive?: boolean;
    };
  };
}

export interface BulkScanRequestWithName extends BulkScanRequest {
  name?: string;
}

export class BulkScanService {
  async executeBulkScan(request: BulkScanRequestWithName): Promise<BulkScanResult> {
    const batchId = this.generateBatchId();
    
    console.log(`Starting bulk scan with batch ID: ${batchId}`);

    try {
      // Find matching images
      const matchingImages = await this.findMatchingImages(
        request.patterns,
        request.patterns.excludeTagPattern ? [request.patterns.excludeTagPattern] : undefined
      );
      
      console.log(`Found ${matchingImages.length} images matching bulk scan criteria`);

      if (matchingImages.length === 0) {
        throw new Error('No images found matching the specified patterns');
      }

      // Apply maxImages limit
      const limitedImages = request.options?.maxImages 
        ? matchingImages.slice(0, request.options.maxImages)
        : matchingImages;

      // Create batch record
      await prisma.bulkScanBatch.create({
        data: {
          id: batchId,
          name: request.name,
          totalImages: limitedImages.length,
          status: 'RUNNING',
          patterns: request.patterns as any,
        }
      });

      // Execute scans - queue will handle concurrency
      const result = await this.executeQueuedScans(
        limitedImages,
        batchId,
        request.options?.scanners
      );

      // Update batch status
      await prisma.bulkScanBatch.update({
        where: { id: batchId },
        data: { 
          status: 'COMPLETED',
          completedAt: new Date()
        }
      });

      console.log(`Bulk scan batch ${batchId} completed. ${result.successful} successful, ${result.failed} failed`);

      return {
        batchId,
        totalImages: limitedImages.length,
        scanIds: result.scanIds,
        skipped: result.failed
      };

    } catch (error) {
      console.error(`Bulk scan batch ${batchId} failed:`, error);
      
      // Update batch status to failed
      await prisma.bulkScanBatch.update({
        where: { id: batchId },
        data: { 
          status: 'FAILED',
          errorMessage: error instanceof Error ? error.message : String(error),
          completedAt: new Date()
        }
      }).catch(console.error);

      throw error;
    }
  }

  async getBulkScanStatus(batchId: string) {
    const batch = await prisma.bulkScanBatch.findUnique({
      where: { id: batchId },
      include: {
        items: {
          include: {
            scan: {
              select: {
                id: true,
                status: true,
                startedAt: true,
                finishedAt: true
              }
            },
            image: {
              select: {
                id: true,
                name: true,
                tag: true,
                source: true
              }
            }
          }
        }
      }
    });

    if (!batch) {
      throw new Error(`Bulk scan batch ${batchId} not found`);
    }

    const summary = {
      running: batch.items.filter(item => item.status === 'RUNNING').length,
      completed: batch.items.filter(item => item.status === 'SUCCESS').length,
      failed: batch.items.filter(item => item.status === 'FAILED').length,
    };

    return {
      ...batch,
      summary
    };
  }

  async cancelBulkScan(batchId: string): Promise<void> {
    const batch = await prisma.bulkScanBatch.findUnique({
      where: { id: batchId },
      include: {
        items: {
          where: { status: 'RUNNING' },
          include: { scan: true }
        }
      }
    });

    if (!batch) {
      throw new Error(`Bulk scan batch ${batchId} not found`);
    }

    if (batch.status !== 'RUNNING') {
      throw new Error(`Bulk scan batch ${batchId} is not running`);
    }

    // Cancel running scans
    for (const item of batch.items) {
      try {
        await scannerService.cancelScan(item.scan.requestId);
      } catch (error) {
        console.warn(`Failed to cancel scan ${item.scanId}:`, error);
      }
    }

    // Update batch status
    await prisma.bulkScanBatch.update({
      where: { id: batchId },
      data: { 
        status: 'FAILED',
        errorMessage: 'Cancelled by user',
        completedAt: new Date()
      }
    });
  }

  private async findMatchingImages(
    patterns: BulkScanRequest['patterns'], 
    excludePatterns?: string[]
  ) {
    const whereConditions: any[] = [];

    // Build dynamic where conditions based on patterns
    if (patterns.imagePattern) {
      const imagePattern = patterns.imagePattern.replace(/\*/g, '%');
      whereConditions.push({
        name: {
          contains: imagePattern.replace(/%/g, '') // PostgreSQL pattern matching
        }
      });
    }

    if (patterns.tagPattern) {
      const tagPattern = patterns.tagPattern.replace(/\*/g, '%');
      whereConditions.push({
        tag: {
          contains: tagPattern.replace(/%/g, '')
        }
      });
    }

    // Registry pattern filtering is not directly supported on images anymore
    // since registry is now stored in the Repository model

    const images = await prisma.image.findMany({
      where: whereConditions.length > 0 ? {
        AND: whereConditions
      } : {},
      select: {
        id: true,
        name: true,
        tag: true,
        source: true,
        digest: true
      },
      orderBy: [
        { name: 'asc' },
        { tag: 'asc' }
      ]
    });

    // Apply exclude patterns (client-side filtering)
    return this.applyExcludePatterns(images, excludePatterns);
  }

  private applyExcludePatterns(images: any[], excludePatterns?: string[]): any[] {
    if (!excludePatterns || excludePatterns.length === 0) {
      return images;
    }

    return images.filter(image => {
      const fullName = `${image.name}:${image.tag}`;

      return !excludePatterns.some(pattern => {
        const regexPattern = pattern
          .replace(/\*/g, '.*')
          .replace(/\?/g, '.');
        const regex = new RegExp(`^${regexPattern}$`);
        return regex.test(fullName);
      });
    });
  }

  private async executeQueuedScans(
    images: any[],
    batchId: string,
    scanners?: {
      trivy?: boolean;
      grype?: boolean;
      syft?: boolean;
      dockle?: boolean;
      osv?: boolean;
      dive?: boolean;
    }
  ): Promise<{ scanIds: string[]; successful: number; failed: number }> {
    const results: string[] = [];
    let successful = 0;
    let failed = 0;
    
    // Submit all scans to the queue with bulk scan priority
    const scanPromises = images.map(async (image, index) => {
      try {
        // Determine correct source based on image source field
        const scanSource: 'registry' | 'local' = 
          image.source === 'LOCAL_DOCKER' ? 'local' : 'registry';

        const scanRequest: ScanRequest = {
          image: image.name,
          tag: image.tag,
          source: scanSource,
          scanners: scanners // Pass scanner configuration
        };
        
        // Use lower priority for bulk scans (0 = normal, -1 = bulk)
        const { scanId, queued, queuePosition } = await scannerService.startScan(scanRequest, -1);

        // Link scan to batch
        await prisma.bulkScanItem.create({
          data: {
            batchId,
            scanId,
            imageId: image.id,
            status: 'RUNNING'
          }
        });

        // Monitor scan completion in background
        this.monitorScanCompletion(batchId, scanId, image.id);

        if (queued) {
          console.log(`Bulk scan for ${image.name}:${image.tag} queued at position ${queuePosition}`);
        }

        successful++;
        return scanId;

      } catch (error) {
        console.error(`Failed to start scan for ${image.name}:${image.tag}`, error);
        
        // Create a failed scan record first to satisfy foreign key constraint
        try {
          const failedScan = await prisma.scan.create({
            data: {
              requestId: `failed-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              imageId: image.id,
              status: 'FAILED',
              startedAt: new Date(),
              finishedAt: new Date(),
              source: 'registry',
              errorMessage: error instanceof Error ? error.message : String(error)
            }
          });

          // Now create the bulk scan item with the failed scan ID
          await prisma.bulkScanItem.create({
            data: {
              batchId,
              scanId: failedScan.id,
              imageId: image.id,
              status: 'FAILED'
            }
          });
        } catch (dbError) {
          console.error('Failed to create failed scan record:', dbError);
        }
        
        failed++;
        return null;
      }
    });

    // Wait for all scan submissions to complete
    const scanResults = await Promise.all(scanPromises);
    results.push(...scanResults.filter((id): id is string => id !== null));

    return { scanIds: results, successful, failed };
  }

  private async monitorScanCompletion(batchId: string, scanId: string, imageId: string): Promise<void> {
    // This would typically be handled by a background job or webhook
    // For now, we'll use a simple polling mechanism
    const pollInterval = setInterval(async () => {
      try {
        const scan = await prisma.scan.findUnique({
          where: { id: scanId },
          select: { status: true }
        });

        if (!scan) {
          clearInterval(pollInterval);
          return;
        }

        if (scan.status === 'SUCCESS' || scan.status === 'FAILED' || scan.status === 'CANCELLED') {
          // Update bulk scan item status
          await prisma.bulkScanItem.updateMany({
            where: {
              batchId,
              scanId,
              imageId
            },
            data: {
              status: scan.status === 'SUCCESS' ? 'SUCCESS' : 'FAILED'
            }
          });

          clearInterval(pollInterval);
        }
      } catch (error) {
        console.error('Error monitoring scan completion:', error);
        clearInterval(pollInterval);
      }
    }, 10000); // Poll every 10 seconds

    // Clean up after 1 hour to prevent memory leaks
    setTimeout(() => {
      clearInterval(pollInterval);
    }, 60 * 60 * 1000);
  }

  private generateBatchId(): string {
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
    const randomHex = Math.random().toString(16).slice(2, 10);
    return `bulk-${timestamp}-${randomHex}`;
  }

  async getBulkScanHistory(limit = 20) {
    const batches = await prisma.bulkScanBatch.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        _count: {
          select: {
            items: true
          }
        },
        items: {
          select: {
            status: true
          }
        }
      }
    });

    // Add summary statistics for each batch
    return batches.map(batch => {
      const items = batch.items;
      const summary = {
        completed: items.filter(item => item.status === 'SUCCESS').length,
        failed: items.filter(item => item.status === 'FAILED').length,
        running: items.filter(item => item.status === 'RUNNING').length,
      };

      return {
        ...batch,
        summary
      };
    });
  }

  async getActiveScans() {
    return prisma.bulkScanBatch.findMany({
      where: { status: 'RUNNING' },
      include: {
        items: {
          include: {
            image: {
              select: {
                name: true,
                tag: true,
                source: true
              }
            },
            scan: {
              select: {
                status: true
              }
            }
          }
        }
      }
    });
  }
}