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
      // Get authentication arguments if repository ID is provided
      let authArgs = await this.getAuthenticationArgsFromRepository(request.repositoryId);
      
      // If no repositoryId provided but image appears to be private, try to find matching repository
      if (!authArgs && !request.repositoryId && this.isLikelyPrivateImage(request.image)) {
        const matchingRepositoryId = await this.findMatchingRepositoryForImage(request.image);
        if (matchingRepositoryId) {
          authArgs = await this.getAuthenticationArgsFromRepository(matchingRepositoryId);
        }
      }
      
      // Use --no-creds flag to explicitly disable Docker config auth when no repository credentials
      const noCredsFlag = request.repositoryId ? '' : '--no-creds';
      const finalAuthArgs = authArgs || noCredsFlag;
      
      const { stdout: digestOutput } = await execAsync(
        `skopeo inspect ${finalAuthArgs} --format '{{.Digest}}' docker://${imageRef}`
      );
      const digest = digestOutput.trim();

      let image = await prisma.image.findUnique({ where: { digest } });
      
      if (!image) {
        const { stdout: metadataOutput } = await execAsync(
          `skopeo inspect ${finalAuthArgs} docker://${imageRef}`
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
    // Update scan record with completion status
    const updateData: any = {
      status: 'SUCCESS',
      finishedAt: new Date(),
    };

    await this.updateScanRecord(scanId, updateData);
    
    // Create or update ScanMetadata record
    await this.createOrUpdateScanMetadata(scanId, reports);
    await this.calculateAggregatedData(scanId, reports);
  }
  
  async createOrUpdateScanMetadata(scanId: string, reports: ScanReports): Promise<void> {
    const metadata = reports.metadata || {};
    
    const scanMetadataData = {
      // Docker Image metadata
      dockerId: metadata.Id || null,
      dockerOs: metadata.Os || metadata.os || null,
      dockerArchitecture: metadata.Architecture || metadata.architecture || null,
      dockerSize: metadata.Size ? BigInt(metadata.Size) : null,
      dockerAuthor: metadata.Author || null,
      dockerCreated: metadata.Created ? new Date(metadata.Created) : null,
      dockerVersion: metadata.DockerVersion || null,
      dockerParent: metadata.Parent || null,
      dockerComment: metadata.Comment || null,
      dockerDigest: metadata.Digest || null,
      dockerConfig: metadata.Config || null,
      dockerRootFS: metadata.RootFS || null,
      dockerGraphDriver: metadata.GraphDriver || null,
      dockerRepoTags: metadata.RepoTags || null,
      dockerRepoDigests: metadata.RepoDigests || null,
      dockerMetadata: metadata.Metadata || null,
      dockerLabels: metadata.Labels || metadata.Config?.Labels || null,
      dockerEnv: metadata.Env || metadata.Config?.Env || null,
      
      // Scan Results
      trivyResults: reports.trivy || null,
      grypeResults: reports.grype || null,
      syftResults: reports.syft || null,
      dockleResults: reports.dockle || null,
      osvResults: reports.osv || null,
      diveResults: reports.dive || null,
      
      // Scanner versions
      scannerVersions: metadata.scannerVersions || null
    };
    
    await prisma.scanMetadata.upsert({
      where: { scanId },
      update: scanMetadataData,
      create: {
        scanId,
        ...scanMetadataData
      }
    });
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
      // Update scan record with risk score
      const scanUpdateData: any = {};
      if (aggregates.riskScore !== undefined) {
        scanUpdateData.riskScore = aggregates.riskScore;
      }
      
      if (Object.keys(scanUpdateData).length > 0) {
        await this.updateScanRecord(scanId, scanUpdateData);
      }
      
      // Update ScanMetadata with aggregated data
      const metadataUpdateData: any = {};
      
      if (aggregates.vulnerabilityCount) {
        metadataUpdateData.vulnerabilityCritical = aggregates.vulnerabilityCount.critical || 0;
        metadataUpdateData.vulnerabilityHigh = aggregates.vulnerabilityCount.high || 0;
        metadataUpdateData.vulnerabilityMedium = aggregates.vulnerabilityCount.medium || 0;
        metadataUpdateData.vulnerabilityLow = aggregates.vulnerabilityCount.low || 0;
        metadataUpdateData.vulnerabilityInfo = aggregates.vulnerabilityCount.info || 0;
      }
      
      if (aggregates.riskScore !== undefined) {
        metadataUpdateData.aggregatedRiskScore = aggregates.riskScore;
      }
      
      if (aggregates.complianceScore?.dockle) {
        const dockle = aggregates.complianceScore.dockle;
        metadataUpdateData.complianceScore = dockle.score || null;
        metadataUpdateData.complianceGrade = dockle.grade || null;
        metadataUpdateData.complianceFatal = dockle.fatal || null;
        metadataUpdateData.complianceWarn = dockle.warn || null;
        metadataUpdateData.complianceInfo = dockle.info || null;
        metadataUpdateData.compliancePass = dockle.pass || null;
      }
      
      await prisma.scanMetadata.update({
        where: { scanId },
        data: metadataUpdateData
      });
    }
  }

  /**
   * Check if an image name appears to be a private repository
   */
  private isLikelyPrivateImage(imageName: string): boolean {
    // Images with usernames (like username/repo) are likely private
    return imageName.includes('/') && !imageName.startsWith('library/');
  }

  /**
   * Find a repository that might contain the given image
   */
  private async findMatchingRepositoryForImage(imageName: string): Promise<string | null> {
    try {
      const repositories = await prisma.repository.findMany({
        where: {
          status: 'ACTIVE'
        }
      });

      for (const repo of repositories) {
        // For Docker Hub repositories, check if the image matches the organization/username pattern
        if (repo.type === 'DOCKERHUB') {
          const username = repo.organization || repo.username;
          if (username && imageName.startsWith(`${username}/`)) {
            return repo.id;
          }
        }
        // For GitHub Container Registry, check ghcr.io pattern
        else if (repo.type === 'GHCR' && repo.registryUrl?.includes('ghcr.io')) {
          const username = repo.organization || repo.username;
          if (username && imageName.startsWith(`ghcr.io/${username}/`)) {
            return repo.id;
          }
        }
        // For generic registries, check if the registry URL matches
        else if (repo.type === 'GENERIC' && repo.registryUrl) {
          const registryHost = repo.registryUrl.replace(/^https?:\/\//, '').split('/')[0];
          if (imageName.startsWith(`${registryHost}/`)) {
            return repo.id;
          }
        }
      }

      return null;
    } catch (error) {
      console.error('Failed to find matching repository:', error);
      return null;
    }
  }

  /**
   * Get authentication arguments for skopeo commands using repository credentials
   */
  private async getAuthenticationArgsFromRepository(repositoryId?: string): Promise<string> {
    if (!repositoryId) {
      return '';
    }

    try {
      const repository = await prisma.repository.findUnique({
        where: { id: repositoryId },
      });

      if (!repository || repository.status !== 'ACTIVE') {
        console.warn(`Repository ${repositoryId} not found or inactive`);
        return '';
      }

      // For now, treating encryptedPassword as plaintext password
      // In production, this should be properly decrypted
      const username = repository.username;
      const password = repository.encryptedPassword;

      if (username && password) {
        // Escape credentials to prevent command injection
        const escapedUsername = username.replace(/"/g, '\\"');
        const escapedPassword = password.replace(/"/g, '\\"');
        return `--creds "${escapedUsername}:${escapedPassword}"`;
      }

      console.warn(`Invalid or missing credentials for repository ${repositoryId}`);
      return '';
    } catch (error) {
      console.error(`Failed to get authentication for repository ${repositoryId}:`, error);
      return '';
    }
  }
}