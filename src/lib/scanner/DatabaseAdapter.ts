import { promisify } from 'util';
import { exec } from 'child_process';
import { prisma } from '@/lib/prisma';
import { inspectDockerImage } from '@/lib/docker';
import { IDatabaseAdapter, ScanReports, AggregatedData, VulnerabilityCount, ComplianceScore } from './types';
import type { ScanRequest } from '@/types';

const execAsync = promisify(exec);

export class DatabaseAdapter implements IDatabaseAdapter {
  private isDevelopmentMode = process.env.NODE_ENV === 'development' && process.platform === 'win32';

  async initializeScanRecord(requestId: string, request: ScanRequest): Promise<{ scanId: string; imageId: string }> {
    if (this.isDevelopmentMode) {
      return this.initializeMockScanRecord(requestId, request);
    }

    if (this.isLocalDockerScan(request)) {
      return this.initializeLocalDockerScanRecord(requestId, request);
    }

    return this.initializeRegistryScanRecord(requestId, request);
  }

  private async initializeMockScanRecord(requestId: string, request: ScanRequest) {
    const mockDigest = `sha256:${Math.random().toString(16).slice(2, 66)}`;
    
    let image = await prisma.image.findFirst({
      where: {
        name: request.image,
        tag: request.tag,
        registry: request.registry,
      }
    });

    if (!image) {
      image = await prisma.image.create({
        data: {
          name: request.image,
          tag: request.tag,
          registry: request.registry,
          digest: mockDigest,
          platform: 'linux/amd64',
          sizeBytes: BigInt(134217728), // 128MB mock size
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
  }

  private isLocalDockerScan(request: ScanRequest): boolean {
    return request.source === 'local' && !!request.dockerImageId;
  }

  private async initializeLocalDockerScanRecord(requestId: string, request: ScanRequest) {
    try {
      const imageData = await inspectDockerImage(request.dockerImageId!);
      const digest = imageData.Id;
      
      let image = await prisma.image.findUnique({ where: { digest } });
      
      if (!image) {
        image = await prisma.image.create({
          data: {
            name: request.image,
            tag: request.tag,
            registry: 'local',
            digest,
            platform: `${imageData.Os}/${imageData.Architecture}`,
            sizeBytes: BigInt(imageData.Size || 0),
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
      throw new Error(`Failed to inspect local Docker image ${request.dockerImageId}: ${errorMessage}`);
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
            digest,
            platform: `${metadata.Os}/${metadata.Architecture}`,
            sizeBytes: BigInt(metadata.Size || 0),
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
    const updateData: any = {
      status: 'SUCCESS',
      finishedAt: new Date(),
      trivy: reports.trivy as any,
      grype: reports.grype as any,
      syft: reports.syft as any,
      dockle: reports.dockle as any,
      osv: reports.osv as any,
      dive: reports.dive as any,
      metadata: reports.metadata as any,
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
      await this.updateScanRecord(scanId, aggregates);
    }
  }
}