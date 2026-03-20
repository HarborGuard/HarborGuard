import { prisma } from '@/lib/prisma';
import { inspectDockerImage } from '@/lib/docker';
import { IDatabaseAdapter, ScanReports } from './types';
import type { ScanRequest } from '@/types';
import { RepositoryService } from '@/services/RepositoryService';
import { RegistryProviderFactory } from '@/lib/registry/providers/RegistryProviderFactory';
import type { Repository } from '@/generated/prisma';
import { createOrUpdateScanMetadata, saveScannerResultTables } from './result-savers';
import { populateNormalizedFindings, calculateAggregatedData } from './finding-normalizer';

export class DatabaseAdapter implements IDatabaseAdapter {
  private repositoryService: RepositoryService;

  constructor() {
    this.repositoryService = RepositoryService.getInstance(prisma);
  }

  async initializeScanRecord(requestId: string, request: ScanRequest): Promise<{ scanId: string; imageId: string }> {
    if (this.isLocalDockerScan(request)) {
      return this.initializeLocalDockerScanRecord(requestId, request);
    }

    if (request.source === 'tar' && request.tarPath) {
      return this.initializeTarScanRecord(requestId, request);
    }

    return this.initializeRegistryScanRecord(requestId, request);
  }

  private isLocalDockerScan(request: ScanRequest): boolean {
    if (request.source === 'local') {
      return true;
    }
    if (request.registry === 'local') {
      return true;
    }
    return false;
  }

  private async initializeLocalDockerScanRecord(requestId: string, request: ScanRequest) {
    try {
      const imageRef = request.dockerImageId || `${request.image}:${request.tag}`;
      const imageData = await inspectDockerImage(imageRef);
      const digest = imageData.Id;

      const image = await prisma.image.upsert({
        where: { digest },
        update: {
          name: request.image,
          tag: request.tag,
          dockerImageId: request.dockerImageId,
        },
        create: {
          name: request.image,
          tag: request.tag,
          source: 'LOCAL_DOCKER',
          digest,
          platform: `${imageData.Os}/${imageData.Architecture}`,
          sizeBytes: imageData.Size ? BigInt(imageData.Size) : null,
          registryType: 'LOCAL',
          dockerImageId: request.dockerImageId,
        }
      });

      const scan = await prisma.scan.create({
        data: {
          requestId,
          imageId: image.id,
          tag: request.tag,
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

  private async initializeTarScanRecord(requestId: string, request: ScanRequest) {
    try {
      const digest = `sha256:tar-${Date.now()}-${Math.random().toString(36).substring(7)}`;

      const image = await prisma.image.create({
        data: {
          name: request.image,
          tag: request.tag,
          source: 'FILE_UPLOAD',
          digest,
          platform: 'linux/amd64',
          sizeBytes: null,
          registryType: 'TAR',
        }
      });

      const scan = await prisma.scan.create({
        data: {
          requestId,
          imageId: image.id,
          tag: request.tag,
          startedAt: new Date(),
          status: 'RUNNING',
          source: 'tar'
        }
      });

      return { scanId: scan.id, imageId: image.id };
    } catch (error) {
      console.error('Failed to initialize tar scan record:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to initialize tar scan: ${errorMessage}`);
    }
  }

  private async initializeRegistryScanRecord(requestId: string, request: ScanRequest) {
    let imageRef = '';

    try {
      let registryUrl = await this.repositoryService.getRegistryUrl(request.repositoryId, request.image) || request.registry;
      let cleanImageName = request.image;

      // Extract registry URL from image name if present
      if (request.image.includes('/')) {
        const parts = request.image.split('/');
        if (parts[0].includes(':') || parts[0].includes('.')) {
          const extractedRegistry = parts[0];
          const extractedImageName = parts.slice(1).join('/');

          if (!registryUrl) {
            registryUrl = extractedRegistry;
            cleanImageName = extractedImageName;
          } else {
            cleanImageName = extractedImageName;
          }
        }
      }

      if (registryUrl && cleanImageName.startsWith(`${registryUrl}/`)) {
        cleanImageName = cleanImageName.substring(registryUrl.length + 1);
      }

      if (!registryUrl && request.registryType) {
        switch (request.registryType) {
          case 'GHCR':
            registryUrl = 'ghcr.io';
            break;
          case 'DOCKERHUB':
            registryUrl = 'docker.io';
            break;
          case 'ECR':
            break;
          case 'GCR':
            registryUrl = 'gcr.io';
            break;
          case 'GITLAB':
            break;
        }
      }

      if (!registryUrl) {
        if (cleanImageName.includes('/') && (cleanImageName.split('/')[0].includes('.') || cleanImageName.split('/')[0].includes(':'))) {
          imageRef = `${cleanImageName}:${request.tag}`;
        } else {
          registryUrl = 'docker.io';
          if (!request.registryType) {
            request.registryType = 'DOCKERHUB';
          }
          console.log('[DatabaseAdapter] No registry specified, defaulting to Docker Hub. For non-Docker Hub images, please provide registry URL.');
        }
      }

      if (registryUrl) {
        const cleanRegistryUrl = registryUrl.replace(/^https?:\/\//, '');
        imageRef = `${cleanRegistryUrl}/${cleanImageName}:${request.tag}`;
      }

      // Get repository - required for registry operations
      let repository: Repository | null = null;
      if (request.repositoryId) {
        repository = await prisma.repository.findUnique({
          where: { id: request.repositoryId }
        });
        console.log('[DatabaseAdapter] Using repository from DB:', {
          id: repository?.id,
          type: repository?.type,
          registryUrl: repository?.registryUrl,
          registryPort: repository?.registryPort,
          skipTlsVerify: repository?.skipTlsVerify
        });
      } else if (request.image) {
        repository = await this.repositoryService.findForImage(request.image);
      }

      if (!repository) {
        repository = this.buildTemporaryRepository(registryUrl, request);
      }

      // Use registry handler for all operations
      console.log('[DatabaseAdapter] Creating provider for repository type:', repository.type);
      const provider = RegistryProviderFactory.createFromRepository(repository);
      console.log('[DatabaseAdapter] Provider created:', provider.getProviderName());
      const inspection = await provider.inspectImage(cleanImageName, request.tag);
      const digest = inspection.digest;
      const metadata = inspection.config || {};

      // Determine registry type
      let registryTypeValue = request.registryType || null;
      if (!registryTypeValue && repository) {
        registryTypeValue = repository.type as "DOCKERHUB" | "GHCR" | "GITLAB" | "GENERIC" | "ECR" | "GCR";
      }
      if (!registryTypeValue) {
        registryTypeValue = this.detectRegistryType(registryUrl);
      }

      // Prepare image data
      const imageSize = this.resolveImageSize(inspection, metadata);

      const imageData: any = {
        name: cleanImageName,
        tag: request.tag,
        source: registryUrl && registryUrl !== 'docker.io' ? 'REGISTRY_PRIVATE' : 'REGISTRY',
        digest,
        platform: metadata.os ? `${metadata.os}/${metadata.architecture || 'unknown'}` : `${metadata.Os || 'unknown'}/${metadata.Architecture || 'unknown'}`,
        sizeBytes: imageSize ? BigInt(imageSize) : null,
        registry: repository ? repository.name : null,
        registryType: registryTypeValue,
      };

      if (request.repositoryId) {
        imageData.primaryRepositoryId = request.repositoryId;
      }

      const image = await prisma.image.upsert({
        where: { digest },
        update: {
          name: cleanImageName,
          tag: request.tag,
          registry: repository ? repository.name : null,
          registryType: registryTypeValue,
          ...(imageSize && { sizeBytes: BigInt(imageSize) }),
          ...(request.repositoryId && { primaryRepositoryId: request.repositoryId })
        },
        create: imageData
      });

      // Create repository-image relationship if repository ID is provided
      if (request.repositoryId && image) {
        await prisma.repositoryImage.upsert({
          where: {
            repositoryId_imageId: {
              repositoryId: request.repositoryId,
              imageId: image.id
            }
          },
          update: {
            imageName: cleanImageName,
            namespace: this.extractNamespaceFromImageName(cleanImageName),
            lastSynced: new Date(),
            syncStatus: 'COMPLETED'
          },
          create: {
            repositoryId: request.repositoryId,
            imageId: image.id,
            imageName: cleanImageName,
            namespace: this.extractNamespaceFromImageName(cleanImageName),
            lastSynced: new Date(),
            syncStatus: 'COMPLETED'
          }
        }).catch(error => {
          console.warn('Failed to create/update repository-image relationship:', error);
        });
      }

      const scan = await prisma.scan.create({
        data: {
          requestId,
          imageId: image.id,
          tag: request.tag,
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

    if (updates.status) {
      try {
        await prisma.bulkScanItem.updateMany({
          where: { scanId },
          data: {
            status: updates.status === 'SUCCESS' || updates.status === 'COMPLETED' ? 'SUCCESS' :
                    updates.status === 'FAILED' || updates.status === 'CANCELLED' ? 'FAILED' :
                    'RUNNING'
          }
        });
      } catch (error) {
        console.debug('Bulk scan item update skipped:', error);
      }
    }
  }

  async uploadScanResults(scanId: string, reports: ScanReports): Promise<void> {
    const updateData: any = {
      status: 'SUCCESS',
      finishedAt: new Date(),
    };

    await this.updateScanRecord(scanId, updateData);

    // Create or update ScanMetadata record (keeps JSONB for downloads)
    const metadataId = await this.createOrUpdateScanMetadata(scanId, reports);

    // Save to individual scanner result tables for fast queries
    await saveScannerResultTables(metadataId, reports);

    // Populate normalized finding tables
    await populateNormalizedFindings(scanId, reports);

    // Calculate aggregated data
    await calculateAggregatedData(scanId, reports, metadataId, this.updateScanRecord.bind(this));
  }

  async createOrUpdateScanMetadata(scanId: string, reports: ScanReports): Promise<string> {
    const metadata = reports.metadata || {};

    const scanMetadataData = {
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

    const scan = await prisma.scan.findUnique({
      where: { id: scanId },
      select: { metadataId: true }
    });

    let metadataId: string;

    if (scan?.metadataId) {
      await prisma.scanMetadata.update({
        where: { id: scan.metadataId },
        data: scanMetadataData
      });
      metadataId = scan.metadataId;
    } else {
      const newMetadata = await prisma.scanMetadata.create({
        data: scanMetadataData
      });
      metadataId = newMetadata.id;

      await prisma.scan.update({
        where: { id: scanId },
        data: { metadataId }
      });
    }

    return metadataId;
  }

  async calculateAggregatedData(scanId: string, reports: ScanReports, metadataId?: string): Promise<void> {
    await calculateAggregatedData(scanId, reports, metadataId, this.updateScanRecord.bind(this));
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private buildTemporaryRepository(registryUrl: string | undefined, request: ScanRequest): Repository {
    let repoType: 'DOCKERHUB' | 'GHCR' | 'GENERIC' | 'ECR' | 'GCR' = 'DOCKERHUB';
    let repoName = 'Docker Hub';
    let repoUrl = registryUrl || 'docker.io';

    if (request.registryType) {
      if (request.registryType === 'GITLAB') {
        repoType = 'GENERIC';
        repoName = 'GitLab Container Registry';
      } else {
        repoType = request.registryType as any;
        switch (request.registryType) {
          case 'GHCR':
            if (!registryUrl || registryUrl === 'docker.io') {
              repoUrl = 'ghcr.io';
            }
            repoName = (!request.repositoryId) ? 'GHCR Public' : 'GitHub Container Registry';
            break;
          case 'ECR':
            repoName = 'AWS Elastic Container Registry';
            break;
          case 'GCR':
            repoName = 'Google Container Registry';
            break;
          case 'DOCKERHUB':
            repoName = 'Docker Hub Public';
            break;
          default:
            repoName = 'Generic Registry';
        }
      }
    } else {
      if (repoUrl.includes('ghcr.io')) {
        repoType = 'GHCR';
        repoName = 'GHCR Public';
      } else if (repoUrl.includes('gitlab')) {
        repoType = 'GENERIC';
        repoName = 'GitLab Container Registry';
      } else if (repoUrl.includes('ecr')) {
        repoType = 'ECR';
        repoName = 'AWS Elastic Container Registry';
      } else if (repoUrl.includes('gcr.io') || repoUrl.includes('pkg.dev')) {
        repoType = 'GCR';
        repoName = 'Google Container Registry';
      } else if (repoUrl === 'docker.io' || repoUrl === 'registry-1.docker.io') {
        repoType = 'DOCKERHUB';
        repoName = 'Docker Hub Public';
      } else {
        repoType = 'GENERIC';
        repoName = 'Generic Registry';
      }
    }

    return {
      id: 'temp',
      name: repoName,
      type: repoType,
      protocol: 'https',
      registryUrl: repoUrl,
      username: '',
      encryptedPassword: '',
      organization: null,
      status: 'ACTIVE',
      lastTested: null,
      repositoryCount: null,
      apiVersion: null,
      capabilities: null,
      rateLimits: null,
      healthCheck: null,
      createdAt: new Date(),
      updatedAt: new Date()
    } as Repository;
  }

  private detectRegistryType(registryUrl: string | undefined): string | null {
    if (!registryUrl) return null;
    if (registryUrl === 'docker.io' || !registryUrl) {
      return 'DOCKERHUB';
    } else if (registryUrl === 'ghcr.io') {
      return 'GHCR';
    } else if (registryUrl === 'gcr.io' || registryUrl?.includes('gcr.io')) {
      return 'GCR';
    } else if (registryUrl?.includes('amazonaws.com')) {
      return 'ECR';
    } else if (registryUrl?.includes('gitlab')) {
      return 'GITLAB';
    }
    return null;
  }

  private resolveImageSize(inspection: any, metadata: any): number {
    if (inspection.size) return inspection.size;
    if (metadata.size) return metadata.size;
    if (metadata.Size) return metadata.Size;
    if (inspection.config?.size) return inspection.config.size;
    if (inspection.config?.Size) return inspection.config.Size;
    return 0;
  }

  private extractNamespaceFromImageName(imageName: string): string | null {
    const parts = imageName.split('/');
    if (parts.length > 1) {
      return parts.slice(0, -1).join('/');
    }
    return null;
  }
}
