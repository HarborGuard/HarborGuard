import { prisma } from '@/lib/prisma';
import { inspectDockerImage } from '@/lib/docker';
import { IDatabaseAdapter } from './types';
import type { ScanRequest } from '@/types';
import { RepositoryService } from '@/lib/registry/RepositoryService';
import { RegistryProviderFactory } from '@/lib/registry/providers/RegistryProviderFactory';
import type { Repository } from '@/generated/prisma';

export class DatabaseAdapter implements IDatabaseAdapter {
  private repositoryService: RepositoryService;

  constructor() {
    this.repositoryService = RepositoryService.getInstance(prisma);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  async initializeScanRecord(requestId: string, request: ScanRequest): Promise<{ scanId: string; imageId: string }> {
    if (this.isLocalDockerScan(request)) {
      return this.initializeLocalDockerScanRecord(requestId, request);
    }
    if (request.source === 'tar' && request.tarPath) {
      return this.initializeTarScanRecord(requestId, request);
    }
    return this.initializeRegistryScanRecord(requestId, request);
  }

  async updateScanRecord(scanId: string, updates: any): Promise<void> {
    await prisma.scan.update({ where: { id: scanId }, data: updates });

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

  // ---------------------------------------------------------------------------
  // Scan initialization helpers
  // ---------------------------------------------------------------------------

  private isLocalDockerScan(request: ScanRequest): boolean {
    return request.source === 'local' || request.registry === 'local';
  }

  private async initializeLocalDockerScanRecord(requestId: string, request: ScanRequest) {
    try {
      const imageRef = request.dockerImageId || `${request.image}:${request.tag}`;
      const imageData = await inspectDockerImage(imageRef);
      const digest = imageData.Id;

      const result = await prisma.$transaction(async (tx) => {
        const image = await tx.image.upsert({
          where: { digest },
          update: { name: request.image, tag: request.tag, dockerImageId: request.dockerImageId },
          create: {
            name: request.image, tag: request.tag, source: 'LOCAL_DOCKER', digest,
            platform: `${imageData.Os}/${imageData.Architecture}`,
            sizeBytes: imageData.Size ? BigInt(imageData.Size) : null,
            dockerImageId: request.dockerImageId,
          }
        });

        const scan = await tx.scan.create({
          data: { requestId, imageId: image.id, tag: request.tag, startedAt: new Date(), status: 'RUNNING', source: 'local' }
        });
        return { scanId: scan.id, imageId: image.id };
      });
      return result;
    } catch (error) {
      console.error('Failed to initialize local Docker scan record:', error);
      const imageRef = request.dockerImageId || `${request.image}:${request.tag}`;
      throw new Error(`Failed to inspect local Docker image ${imageRef}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async initializeTarScanRecord(requestId: string, request: ScanRequest) {
    try {
      const digest = `sha256:tar-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      const result = await prisma.$transaction(async (tx) => {
        const image = await tx.image.create({
          data: { name: request.image, tag: request.tag, source: 'FILE_UPLOAD', digest, platform: 'linux/amd64', sizeBytes: null, registryType: 'TAR' }
        });
        const scan = await tx.scan.create({
          data: { requestId, imageId: image.id, tag: request.tag, startedAt: new Date(), status: 'RUNNING', source: 'tar' }
        });
        return { scanId: scan.id, imageId: image.id };
      });
      return result;
    } catch (error) {
      console.error('Failed to initialize tar scan record:', error);
      throw new Error(`Failed to initialize tar scan: ${error instanceof Error ? error.message : String(error)}`);
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
          if (!registryUrl) registryUrl = parts[0];
          cleanImageName = parts.slice(1).join('/');
        }
      }

      if (registryUrl && cleanImageName.startsWith(`${registryUrl}/`)) {
        cleanImageName = cleanImageName.substring(registryUrl.length + 1);
      }

      if (!registryUrl && request.registryType) {
        const urlMap: Record<string, string> = { GHCR: 'ghcr.io', DOCKERHUB: 'docker.io', GCR: 'gcr.io' };
        if (urlMap[request.registryType]) registryUrl = urlMap[request.registryType];
      }

      if (!registryUrl) {
        if (cleanImageName.includes('/') && (cleanImageName.split('/')[0].includes('.') || cleanImageName.split('/')[0].includes(':'))) {
          imageRef = `${cleanImageName}:${request.tag}`;
        } else {
          registryUrl = 'docker.io';
          if (!request.registryType) request.registryType = 'DOCKERHUB';
          console.log('[DatabaseAdapter] No registry specified, defaulting to Docker Hub.');
        }
      }

      if (registryUrl) {
        imageRef = `${registryUrl.replace(/^https?:\/\//, '')}/${cleanImageName}:${request.tag}`;
      }

      // Get repository
      let repository: Repository | null = null;
      if (request.repositoryId) {
        repository = await prisma.repository.findUnique({ where: { id: request.repositoryId } });
        console.log('[DatabaseAdapter] Using repository from DB:', {
          id: repository?.id, type: repository?.type, registryUrl: repository?.registryUrl,
          registryPort: repository?.registryPort, skipTlsVerify: repository?.skipTlsVerify
        });
      } else if (request.image) {
        repository = await this.repositoryService.findForImage(request.image);
      }

      if (!repository) {
        repository = this.buildTemporaryRepository(registryUrl, request);
      }

      console.log('[DatabaseAdapter] Creating provider for repository type:', repository.type);
      const provider = RegistryProviderFactory.createFromRepository(repository);
      console.log('[DatabaseAdapter] Provider created:', provider.getProviderName());
      const inspection = await provider.inspectImage(cleanImageName, request.tag);
      const digest = inspection.digest;
      const metadata = inspection.config || {};

      // Determine registry type
      const registryTypeValue = request.registryType
        || (repository ? repository.type as string : null)
        || this.detectRegistryType(registryUrl);

      const imageSize = this.resolveImageSize(inspection, metadata);
      const imageData: any = {
        name: cleanImageName, tag: request.tag, digest,
        source: registryUrl && registryUrl !== 'docker.io' ? 'REGISTRY_PRIVATE' : 'REGISTRY',
        platform: metadata.os ? `${metadata.os}/${metadata.architecture || 'unknown'}` : `${metadata.Os || 'unknown'}/${metadata.Architecture || 'unknown'}`,
        sizeBytes: imageSize ? BigInt(imageSize) : null,
        registry: repository ? repository.name : null,
        registryType: registryTypeValue,
      };
      if (request.repositoryId) imageData.primaryRepositoryId = request.repositoryId;

      const result = await prisma.$transaction(async (tx) => {
        const image = await tx.image.upsert({
          where: { digest },
          update: {
            name: cleanImageName, tag: request.tag,
            registry: repository ? repository.name : null, registryType: registryTypeValue,
            ...(imageSize && { sizeBytes: BigInt(imageSize) }),
            ...(request.repositoryId && { primaryRepositoryId: request.repositoryId })
          },
          create: imageData
        });

        if (request.repositoryId && image) {
          const ns = this.extractNamespaceFromImageName(cleanImageName);
          await tx.repositoryImage.upsert({
            where: { repositoryId_imageId: { repositoryId: request.repositoryId, imageId: image.id } },
            update: { imageName: cleanImageName, namespace: ns, lastSynced: new Date(), syncStatus: 'COMPLETED' },
            create: { repositoryId: request.repositoryId, imageId: image.id, imageName: cleanImageName, namespace: ns, lastSynced: new Date(), syncStatus: 'COMPLETED' }
          }).catch(err => console.warn('Failed to create/update repository-image relationship:', err));
        }

        const scan = await tx.scan.create({
          data: { requestId, imageId: image.id, tag: request.tag, startedAt: new Date(), status: 'RUNNING', source: request.source || 'registry' }
        });
        return { scanId: scan.id, imageId: image.id };
      });
      return result;
    } catch (error) {
      console.error('Failed to initialize scan record:', error);
      throw new Error(`Failed to inspect image ${imageRef}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private buildTemporaryRepository(registryUrl: string | undefined, request: ScanRequest): Repository {
    let repoType: 'DOCKERHUB' | 'GHCR' | 'GENERIC' | 'ECR' | 'GCR' = 'DOCKERHUB';
    let repoName = 'Docker Hub';
    const repoUrl = this.resolveRepoUrl(registryUrl, request);

    if (request.registryType) {
      if (request.registryType === 'GITLAB') {
        repoType = 'GENERIC'; repoName = 'GitLab Container Registry';
      } else {
        repoType = request.registryType as any;
        const nameMap: Record<string, string> = { ECR: 'AWS Elastic Container Registry', GCR: 'Google Container Registry', DOCKERHUB: 'Docker Hub Public' };
        if (request.registryType === 'GHCR') {
          repoName = !request.repositoryId ? 'GHCR Public' : 'GitHub Container Registry';
        } else {
          repoName = nameMap[request.registryType] || 'Generic Registry';
        }
      }
    } else {
      ({ repoType, repoName } = this.detectRepoTypeAndName(repoUrl));
    }

    return {
      id: 'temp', name: repoName, type: repoType, protocol: 'https', registryUrl: repoUrl,
      username: '', encryptedPassword: '', organization: null, status: 'ACTIVE',
      lastTested: null, repositoryCount: null, apiVersion: null, capabilities: null,
      rateLimits: null, healthCheck: null, createdAt: new Date(), updatedAt: new Date()
    } as Repository;
  }

  private resolveRepoUrl(registryUrl: string | undefined, request: ScanRequest): string {
    if (registryUrl && registryUrl !== 'docker.io' && request.registryType === 'GHCR') return registryUrl;
    if (!registryUrl || registryUrl === 'docker.io') {
      if (request.registryType === 'GHCR') return 'ghcr.io';
    }
    return registryUrl || 'docker.io';
  }

  private detectRepoTypeAndName(repoUrl: string): { repoType: 'DOCKERHUB' | 'GHCR' | 'GENERIC' | 'ECR' | 'GCR'; repoName: string } {
    if (repoUrl.includes('ghcr.io')) return { repoType: 'GHCR', repoName: 'GHCR Public' };
    if (repoUrl.includes('gitlab')) return { repoType: 'GENERIC', repoName: 'GitLab Container Registry' };
    if (repoUrl.includes('ecr')) return { repoType: 'ECR', repoName: 'AWS Elastic Container Registry' };
    if (repoUrl.includes('gcr.io') || repoUrl.includes('pkg.dev')) return { repoType: 'GCR', repoName: 'Google Container Registry' };
    if (repoUrl === 'docker.io' || repoUrl === 'registry-1.docker.io') return { repoType: 'DOCKERHUB', repoName: 'Docker Hub Public' };
    return { repoType: 'GENERIC', repoName: 'Generic Registry' };
  }

  private detectRegistryType(registryUrl: string | undefined): string | null {
    if (!registryUrl) return null;
    if (registryUrl === 'docker.io') return 'DOCKERHUB';
    if (registryUrl === 'ghcr.io') return 'GHCR';
    if (registryUrl.includes('gcr.io')) return 'GCR';
    if (registryUrl.includes('amazonaws.com')) return 'ECR';
    if (registryUrl.includes('gitlab')) return 'GITLAB';
    return null;
  }

  private resolveImageSize(inspection: any, metadata: any): number {
    return inspection.size || metadata.size || metadata.Size || inspection.config?.size || inspection.config?.Size || 0;
  }

  private extractNamespaceFromImageName(imageName: string): string | null {
    const parts = imageName.split('/');
    return parts.length > 1 ? parts.slice(0, -1).join('/') : null;
  }
}
