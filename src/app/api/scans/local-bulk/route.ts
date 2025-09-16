import { NextRequest, NextResponse } from 'next/server';
import { listDockerImages } from '@/lib/docker';
import { BulkScanService } from '@/lib/bulk/BulkScanService';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { scannerService } from '@/lib/scanner';
import type { ScanRequest } from '@/types';

export async function POST(request: NextRequest) {
  try {
    logger.info('Starting bulk scan of all local Docker images');
    
    // Get all local Docker images
    const localImages = await listDockerImages();
    
    if (localImages.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No local Docker images found'
      }, { status: 400 });
    }
    
    logger.info(`Found ${localImages.length} local Docker images to scan`);
    
    // Generate batch ID
    const batchId = generateBatchId();
    
    // Create batch record
    await prisma.bulkScanBatch.create({
      data: {
        id: batchId,
        name: 'Local Docker Images Scan',
        totalImages: localImages.length,
        status: 'RUNNING',
        patterns: {
          source: 'local',
          imagePattern: '*',
          tagPattern: '*'
        } as any,
      }
    });
    
    // Start scans for each image
    const scanIds: string[] = [];
    let successful = 0;
    let failed = 0;
    
    // Process images with concurrency control (max 3 concurrent scans)
    const maxConcurrent = 3;
    
    for (let i = 0; i < localImages.length; i += maxConcurrent) {
      const chunk = localImages.slice(i, i + maxConcurrent);
      
      const chunkPromises = chunk.map(async (image) => {
        let dbImage: any = null;
        
        try {
          // Upsert the image - create if doesn't exist, or update if it does
          const imageDigest = image.digest || image.id;
          
          dbImage = await prisma.image.upsert({
            where: {
              digest: imageDigest
            },
            update: {
              name: image.repository,
              tag: image.tag,
              source: 'LOCAL_DOCKER',
              platform: 'linux/amd64',
              sizeBytes: BigInt(parseInt(image.size.replace(/[^\d]/g, '')) * 1024 * 1024), // Convert MB to bytes
              updatedAt: new Date()
            },
            create: {
              name: image.repository,
              tag: image.tag,
              digest: imageDigest,
              source: 'LOCAL_DOCKER',
              platform: 'linux/amd64',
              sizeBytes: BigInt(parseInt(image.size.replace(/[^\d]/g, '')) * 1024 * 1024), // Convert MB to bytes
            }
          });
          
          // Prepare scan request
          const scanRequest: ScanRequest = {
            image: image.repository,
            tag: image.tag,
            source: 'local',
            dockerImageId: image.id,
          };
          
          // Start the scan
          const { scanId } = await scannerService.startScan(scanRequest);
          
          // Link scan to batch
          await prisma.bulkScanItem.create({
            data: {
              batchId,
              scanId,
              imageId: dbImage.id,
              status: 'RUNNING'
            }
          });
          
          // Monitor scan completion in background
          monitorScanCompletion(batchId, scanId, dbImage.id);
          
          successful++;
          scanIds.push(scanId);
          
          return scanId;
        } catch (error) {
          logger.error(`Failed to start scan for ${image.repository}:${image.tag}`, error);
          
          // Create a failed scan record only if we have a dbImage
          if (dbImage) {
            try {
              const failedScan = await prisma.scan.create({
                data: {
                  requestId: `failed-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                  imageId: dbImage.id,
                  status: 'FAILED',
                  startedAt: new Date(),
                  finishedAt: new Date(),
                  source: 'local',
                  errorMessage: error instanceof Error ? error.message : String(error)
                }
              });
              
              await prisma.bulkScanItem.create({
                data: {
                  batchId,
                  scanId: failedScan.id,
                  imageId: dbImage.id,
                  status: 'FAILED'
                }
              });
            } catch (dbError) {
              logger.error('Failed to create failed scan record:', dbError);
            }
          }
          
          failed++;
          return null;
        }
      });
      
      const chunkResults = await Promise.all(chunkPromises);
      
      // Small delay between chunks
      if (i + maxConcurrent < localImages.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // Update batch status if all failed
    if (successful === 0) {
      await prisma.bulkScanBatch.update({
        where: { id: batchId },
        data: {
          status: 'FAILED',
          errorMessage: 'All scans failed to start',
          completedAt: new Date()
        }
      });
      
      return NextResponse.json({
        success: false,
        error: 'Failed to start any scans'
      }, { status: 500 });
    }
    
    logger.info(`Bulk scan batch ${batchId} initiated. ${successful} successful, ${failed} failed`);
    
    return NextResponse.json({
      success: true,
      data: {
        batchId,
        totalImages: localImages.length,
        scanIds: scanIds.filter(id => id !== null),
        successful,
        failed
      }
    }, { status: 201 });
    
  } catch (error) {
    logger.error('Failed to start bulk scan of local images:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start bulk scan'
    }, { status: 500 });
  }
}

// Monitor scan completion in background
async function monitorScanCompletion(batchId: string, scanId: string, imageId: string): Promise<void> {
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
        
        // Check if all items are complete
        const batch = await prisma.bulkScanBatch.findUnique({
          where: { id: batchId },
          include: {
            items: {
              select: { status: true }
            }
          }
        });
        
        if (batch) {
          const allComplete = batch.items.every(item => 
            item.status === 'SUCCESS' || item.status === 'FAILED'
          );
          
          if (allComplete && batch.status === 'RUNNING') {
            await prisma.bulkScanBatch.update({
              where: { id: batchId },
              data: {
                status: 'COMPLETED',
                completedAt: new Date()
              }
            });
            logger.info(`Bulk scan batch ${batchId} completed`);
          }
        }
        
        clearInterval(pollInterval);
      }
    } catch (error) {
      logger.error('Error monitoring scan completion:', error);
      clearInterval(pollInterval);
    }
  }, 10000); // Poll every 10 seconds
  
  // Clean up after 1 hour
  setTimeout(() => {
    clearInterval(pollInterval);
  }, 60 * 60 * 1000);
}

function generateBatchId(): string {
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
  const randomHex = Math.random().toString(16).slice(2, 10);
  return `local-bulk-${timestamp}-${randomHex}`;
}