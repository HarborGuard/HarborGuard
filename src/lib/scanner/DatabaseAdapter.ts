import { promisify } from 'util';
import { exec } from 'child_process';
import { prisma } from '@/lib/prisma';
import { inspectDockerImage } from '@/lib/docker';
import { IDatabaseAdapter, ScanReports, AggregatedData, VulnerabilityCount, ComplianceScore } from './types';
import type { ScanRequest } from '@/types';

const execAsync = promisify(exec);

export class DatabaseAdapter implements IDatabaseAdapter {

  async initializeScanRecord(requestId: string, request: ScanRequest): Promise<{ scanId: string; imageId: string }> {
    if (this.isLocalDockerScan(request)) {
      return this.initializeLocalDockerScanRecord(requestId, request);
    }

    return this.initializeRegistryScanRecord(requestId, request);
  }

  private isLocalDockerScan(request: ScanRequest): boolean {
    // Check if explicitly set to local source
    if (request.source === 'local') {
      return true;
    }
    
    // Legacy check: if registry is 'local', treat as local Docker scan
    if (request.registry === 'local') {
      return true;
    }
    
    return false;
  }

  private async initializeLocalDockerScanRecord(requestId: string, request: ScanRequest) {
    try {
      // Use dockerImageId if provided, otherwise use image:tag format
      const imageRef = request.dockerImageId || `${request.image}:${request.tag}`;
      const imageData = await inspectDockerImage(imageRef);
      const digest = imageData.Id;
      
      let image = await prisma.image.findUnique({ where: { digest } });
      
      if (!image) {
        image = await prisma.image.create({
          data: {
            name: request.image,
            tag: request.tag,
            registry: 'local',
            source: 'LOCAL_DOCKER',
            digest,
            platform: `${imageData.Os}/${imageData.Architecture}`,
            sizeBytes: Number(imageData.Size || 0),
          }
        });
      }

      const scan = await prisma.scan.create({
        data: {
          requestId,
          imageId: image.id,
          startedAt: new Date(),
          status: 'RUNNING',
          source: 'local'
        }
      });

      return { scanId: scan.id, imageId: image.id };
    } catch (error) {
      console.error('Failed to initialize local Docker scan record:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      const imageRef = request.dockerImageId || `${request.image}:${request.tag}`;
      throw new Error(`Failed to inspect local Docker image ${imageRef}: ${errorMessage}`);
    }
  }

  private async initializeRegistryScanRecord(requestId: string, request: ScanRequest) {
    const fullImageName = request.registry ? `${request.registry}/${request.image}` : request.image;
    const imageRef = `${fullImageName}:${request.tag}`;

    try {
      const { stdout: digestOutput } = await execAsync(
        `skopeo inspect --format '{{.Digest}}' docker://${imageRef}`
      );
      const digest = digestOutput.trim();

      let image = await prisma.image.findUnique({ where: { digest } });
      
      if (!image) {
        const { stdout: metadataOutput } = await execAsync(
          `skopeo inspect docker://${imageRef}`
        );
        const metadata = JSON.parse(metadataOutput);

        image = await prisma.image.create({
          data: {
            name: request.image,
            tag: request.tag,
            registry: request.registry,
            source: request.registry && request.registry !== 'docker.io' ? 'REGISTRY_PRIVATE' : 'REGISTRY',
            digest,
            platform: `${metadata.Os}/${metadata.Architecture}`,
            sizeBytes: Number(metadata.Size || 0),
          }
        });
      }

      const scan = await prisma.scan.create({
        data: {
          requestId,
          imageId: image.id,
          startedAt: new Date(),
          status: 'RUNNING',
          source: request.source || 'registry'
        }
      });

      return { scanId: scan.id, imageId: image.id };
    } catch (error) {
      console.error('Failed to initialize scan record:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to inspect image ${imageRef}: ${errorMessage}`);
    }
  }

  async updateScanRecord(scanId: string, updates: any): Promise<void> {
    await prisma.scan.update({
      where: { id: scanId },
      data: updates
    });
  }

  async uploadScanResults(scanId: string, reports: ScanReports): Promise<void> {
    // Update scan record with completion status and metadata
    const updateData: any = {
      status: 'SUCCESS',
      finishedAt: new Date(),
      metadata: {
        ...reports.metadata,
        scanResults: {
          trivy: reports.trivy,
          grype: reports.grype,
          syft: reports.syft,
          dockle: reports.dockle,
          osv: reports.osv,
          dive: reports.dive,
        }
      } as any,
    };

    await this.updateScanRecord(scanId, updateData);
    await this.calculateAggregatedData(scanId, reports);
  }

  async calculateAggregatedData(scanId: string, reports: ScanReports): Promise<void> {
    const aggregates: AggregatedData = {};

    if (reports.trivy?.Results) {
      const vulnCount: VulnerabilityCount = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
      let totalCvssScore = 0;
      let cvssCount = 0;

      for (const result of reports.trivy.Results) {
        if (result.Vulnerabilities) {
          for (const vuln of result.Vulnerabilities) {
            const severity = vuln.Severity?.toLowerCase();
            if (severity && vulnCount.hasOwnProperty(severity)) {
              vulnCount[severity as keyof VulnerabilityCount]++;
            }
            
            if (vuln.CVSS?.redhat?.V3Score || vuln.CVSS?.nvd?.V3Score) {
              const score = vuln.CVSS.redhat?.V3Score || vuln.CVSS.nvd?.V3Score;
              totalCvssScore += score;
              cvssCount++;
            }
          }
        }
      }

      aggregates.vulnerabilityCount = vulnCount;
      
      const avgCvss = cvssCount > 0 ? totalCvssScore / cvssCount : 0;
      aggregates.riskScore = Math.min(100, Math.round(
        (vulnCount.critical * 25) +
        (vulnCount.high * 10) +
        (vulnCount.medium * 3) +
        (vulnCount.low * 1) +
        (avgCvss * 5)
      ));
    }

    if (reports.dockle?.summary) {
      const { fatal, warn, info, pass } = reports.dockle.summary;
      const total = fatal + warn + info + pass;
      const complianceScore = total > 0 ? Math.round((pass / total) * 100) : 0;
      
      aggregates.complianceScore = {
        dockle: {
          score: complianceScore,
          grade: complianceScore >= 90 ? 'A' : complianceScore >= 80 ? 'B' : complianceScore >= 70 ? 'C' : 'D',
          fatal,
          warn,
          info,
          pass,
        }
      };
    }

    if (Object.keys(aggregates).length > 0) {
      // Get current scan to merge metadata
      const currentScan = await prisma.scan.findUnique({
        where: { id: scanId },
        select: { metadata: true }
      });
      
      const currentMetadata = currentScan?.metadata as any || {};
      
      // Store aggregated data in metadata field and riskScore directly
      const updateData: any = {
        metadata: {
          ...currentMetadata,
          aggregatedData: aggregates
        } as any
      };
      
      // Extract riskScore to store in the dedicated field
      if (aggregates.riskScore !== undefined) {
        updateData.riskScore = aggregates.riskScore;
      }
      
      await this.updateScanRecord(scanId, updateData);
    }
  }
}