import { promisify } from 'util';
import { exec } from 'child_process';
import { prisma } from '@/lib/prisma';
import { inspectDockerImage } from '@/lib/docker';
import { IDatabaseAdapter, ScanReports, AggregatedData, VulnerabilityCount, ComplianceScore } from './types';
import type { ScanRequest } from '@/types';
import { RepositoryService } from '@/services/RepositoryService';
import { RegistryProviderFactory } from '@/lib/registry/providers/RegistryProviderFactory';
import type { Repository } from '@/generated/prisma';

const execAsync = promisify(exec);

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
            source: 'LOCAL_DOCKER',
            digest,
            platform: `${imageData.Os}/${imageData.Architecture}`,
            sizeBytes: imageData.Size ? BigInt(imageData.Size) : null,
          }
        });
      }

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
      // For tar files, we don't need to inspect from registry
      // Create a unique digest based on the tar path and timestamp
      const digest = `sha256:tar-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      
      const image = await prisma.image.create({
        data: {
          name: request.image,
          tag: request.tag,
          source: 'FILE_UPLOAD',
          digest,
          platform: 'linux/amd64',
          sizeBytes: null
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
    // Declare imageRef outside try block so it's accessible in catch block
    let imageRef = '';
    
    try {
      // Get registry URL from repository service
      let registryUrl = await this.repositoryService.getRegistryUrl(request.repositoryId, request.image) || request.registry;
      let cleanImageName = request.image;
      
      // Extract registry URL from image name if present
      if (request.image.includes('/')) {
        const parts = request.image.split('/');
        // If first part looks like a registry (has port or domain), extract it
        if (parts[0].includes(':') || parts[0].includes('.')) {
          const extractedRegistry = parts[0];
          const extractedImageName = parts.slice(1).join('/');
          
          if (!registryUrl) {
            // No repository found, use the extracted registry
            registryUrl = extractedRegistry;
            cleanImageName = extractedImageName;
          } else {
            // We have a registry from repository, clean the image name
            cleanImageName = extractedImageName;
          }
        }
      }
      
      // If cleanImageName already starts with the registry URL, remove it to avoid duplication
      if (registryUrl && cleanImageName.startsWith(`${registryUrl}/`)) {
        cleanImageName = cleanImageName.substring(registryUrl.length + 1);
      }
      
      // If we still don't have a registry URL, check if we have a registry type hint
      if (!registryUrl && request.registryType) {
        // Use registry type hint to determine the registry URL
        switch (request.registryType) {
          case 'GHCR':
            registryUrl = 'ghcr.io';
            break;
          case 'DOCKERHUB':
            registryUrl = 'docker.io';
            break;
          case 'ECR':
            // ECR needs more specific URL, but we can't determine it without more info
            break;
          case 'GCR':
            registryUrl = 'gcr.io';
            break;
          case 'GITLAB':
            // GitLab needs specific instance URL
            break;
        }
      }
      
      // If we still don't have a registry URL, we need to handle this case
      if (!registryUrl) {
        // Check if the image name itself already contains a registry
        if (cleanImageName.includes('/') && (cleanImageName.split('/')[0].includes('.') || cleanImageName.split('/')[0].includes(':'))) {
          // The image name already has a registry prefix
          imageRef = `${cleanImageName}:${request.tag}`;
        } else {
          // No registry found - cannot proceed without knowing where to pull from
          throw new Error(`No registry specified for image ${cleanImageName}:${request.tag}. Please provide a registry URL or repository ID.`);
        }
      } else {
        // Construct full image reference with registry
        // Remove protocol from registry URL for docker:// format
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
        // Try to find a repository for this image
        repository = await this.repositoryService.findForImage(request.image);
      }
      
      if (!repository) {
        // Create a temporary repository based on the registry URL and type hint
        let repoType: 'DOCKERHUB' | 'GHCR' | 'GENERIC' | 'ECR' | 'GCR' = 'DOCKERHUB';
        let repoName = 'Docker Hub';
        let repoUrl = registryUrl || 'docker.io';
        
        // Use registryType hint if provided
        if (request.registryType) {
          if (request.registryType === 'GITLAB') {
            // GitLab uses GENERIC type with special handling
            repoType = 'GENERIC';
            repoName = 'GitLab Container Registry';
          } else {
            repoType = request.registryType as any;
            switch (request.registryType) {
              case 'GHCR':
                // Set correct registry URL for GHCR
                if (!registryUrl || registryUrl === 'docker.io') {
                  repoUrl = 'ghcr.io';
                }
                // Check if it's public (no auth) or private
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
          // Auto-detect repository type based on registry URL
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
        
        repository = {
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
      
      // Use registry handler for all operations
      console.log('[DatabaseAdapter] Creating provider for repository type:', repository.type);
      const provider = RegistryProviderFactory.createFromRepository(repository);
      console.log('[DatabaseAdapter] Provider created:', provider.getProviderName());
      const inspection = await provider.inspectImage(cleanImageName, request.tag);
      const digest = inspection.digest;
      const metadata = inspection.config || {};

      // Prepare image data
      const imageData: any = {
        name: cleanImageName,
        tag: request.tag,
        source: registryUrl && registryUrl !== 'docker.io' ? 'REGISTRY_PRIVATE' : 'REGISTRY',
        digest,
        platform: metadata.os ? `${metadata.os}/${metadata.architecture || 'unknown'}` : `${metadata.Os || 'unknown'}/${metadata.Architecture || 'unknown'}`,
        sizeBytes: (metadata.size || metadata.Size) ? BigInt(metadata.size || metadata.Size) : null,
        // Save the descriptive repository name for one-off scans
        registry: repository ? repository.name : null,
      };

      // If we have a repository ID, set it as the primary repository
      if (request.repositoryId) {
        imageData.primaryRepositoryId = request.repositoryId;
      }

      // Use upsert to handle both new and existing images
      const image = await prisma.image.upsert({
        where: { digest },
        update: {
          // Always update these fields in case they've changed
          name: cleanImageName,
          tag: request.tag,
          // Update registry name if we have a repository
          registry: repository ? repository.name : null,
          // Only update primary repository if provided
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
          // Log errors but don't fail the scan
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
  }

  async uploadScanResults(scanId: string, reports: ScanReports): Promise<void> {
    // Update scan record with completion status
    const updateData: any = {
      status: 'SUCCESS',
      finishedAt: new Date(),
    };

    await this.updateScanRecord(scanId, updateData);
    
    // Create or update ScanMetadata record (keeps JSONB for downloads)
    const metadataId = await this.createOrUpdateScanMetadata(scanId, reports);
    
    // Save to individual scanner result tables for fast queries
    await this.saveScannerResultTables(metadataId, reports);
    
    // Populate normalized finding tables
    await this.populateNormalizedFindings(scanId, reports);
    
    // Calculate aggregated data
    await this.calculateAggregatedData(scanId, reports, metadataId);
  }
  
  async createOrUpdateScanMetadata(scanId: string, reports: ScanReports): Promise<string> {
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
    
    // Check if scan already has metadata
    const scan = await prisma.scan.findUnique({
      where: { id: scanId },
      select: { metadataId: true }
    });
    
    let metadataId: string;
    
    if (scan?.metadataId) {
      // Update existing metadata
      await prisma.scanMetadata.update({
        where: { id: scan.metadataId },
        data: scanMetadataData
      });
      metadataId = scan.metadataId;
    } else {
      // Create new metadata
      const newMetadata = await prisma.scanMetadata.create({
        data: scanMetadataData
      });
      metadataId = newMetadata.id;
      
      // Link to scan
      await prisma.scan.update({
        where: { id: scanId },
        data: { metadataId }
      });
    }
    
    return metadataId;
  }

  /**
   * Save scan results to individual scanner tables for optimized queries
   */
  async saveScannerResultTables(metadataId: string, reports: ScanReports): Promise<void> {
    try {
      // Save each scanner's results to its dedicated table
      if (reports.grype) {
        await this.saveGrypeResults(metadataId, reports.grype);
      }
      
      if (reports.trivy) {
        await this.saveTrivyResults(metadataId, reports.trivy);
      }
      
      if (reports.dive) {
        await this.saveDiveResults(metadataId, reports.dive);
      }
      
      if (reports.syft) {
        await this.saveSyftResults(metadataId, reports.syft);
      }
      
      if (reports.dockle) {
        await this.saveDockleResults(metadataId, reports.dockle);
      }
      
      if (reports.osv) {
        await this.saveOsvResults(metadataId, reports.osv);
      }
    } catch (error) {
      console.error('Error saving to scanner result tables:', error);
      // Continue even if table save fails - we still have the JSONB data
    }
  }

  private async saveGrypeResults(metadataId: string, grypeData: any): Promise<void> {
    const grypeResult = await prisma.grypeResults.create({
      data: {
        scanMetadataId: metadataId,
        matchesCount: grypeData.matches?.length || 0,
        dbStatus: grypeData.db || null,
      }
    });

    if (grypeData.matches && grypeData.matches.length > 0) {
      const vulnerabilities = grypeData.matches.map((match: any) => ({
        grypeResultsId: grypeResult.id,
        vulnerabilityId: match.vulnerability?.id || 'UNKNOWN',
        severity: match.vulnerability?.severity || 'INFO',
        namespace: match.vulnerability?.namespace || null,
        packageName: match.artifact?.name || 'unknown',
        packageVersion: match.artifact?.version || '',
        packageType: match.artifact?.type || 'unknown',
        packagePath: match.artifact?.locations?.[0]?.path || null,
        packageLanguage: match.artifact?.language || null,
        fixState: match.vulnerability?.fix?.state || null,
        fixVersions: match.vulnerability?.fix?.versions || null,
        cvssV2Score: match.vulnerability?.cvss?.[0]?.version === '2.0' ? 
          match.vulnerability.cvss[0].metrics?.baseScore : null,
        cvssV2Vector: match.vulnerability?.cvss?.[0]?.version === '2.0' ? 
          match.vulnerability.cvss[0].vector : null,
        cvssV3Score: match.vulnerability?.cvss?.find((c: any) => c.version?.startsWith('3'))?.metrics?.baseScore || null,
        cvssV3Vector: match.vulnerability?.cvss?.find((c: any) => c.version?.startsWith('3'))?.vector || null,
        urls: match.vulnerability?.urls || null,
        description: match.vulnerability?.description || null,
      }));

      await prisma.grypeVulnerability.createMany({ data: vulnerabilities });
    }
  }

  private async saveTrivyResults(metadataId: string, trivyData: any): Promise<void> {
    const trivyResult = await prisma.trivyResults.create({
      data: {
        scanMetadataId: metadataId,
        schemaVersion: trivyData.SchemaVersion || null,
        artifactName: trivyData.ArtifactName || null,
        artifactType: trivyData.ArtifactType || null,
      }
    });

    if (trivyData.Results && trivyData.Results.length > 0) {
      for (const result of trivyData.Results) {
        // Save vulnerabilities
        if (result.Vulnerabilities && result.Vulnerabilities.length > 0) {
          const vulnerabilities = result.Vulnerabilities.map((vuln: any) => ({
            trivyResultsId: trivyResult.id,
            targetName: result.Target || '',
            targetClass: result.Class || null,
            targetType: result.Type || null,
            vulnerabilityId: vuln.VulnerabilityID || 'UNKNOWN',
            pkgId: vuln.PkgID || null,
            pkgName: vuln.PkgName || 'unknown',
            pkgPath: vuln.PkgPath || null,
            installedVersion: vuln.InstalledVersion || null,
            fixedVersion: vuln.FixedVersion || null,
            status: vuln.Status || null,
            severity: vuln.Severity || 'INFO',
            severitySource: vuln.SeveritySource || null,
            primaryUrl: vuln.PrimaryURL || null,
            cvssScore: vuln.CVSS?.nvd?.V2Score || null,
            cvssVector: vuln.CVSS?.nvd?.V2Vector || null,
            cvssScoreV3: vuln.CVSS?.nvd?.V3Score || vuln.CVSS?.redhat?.V3Score || null,
            cvssVectorV3: vuln.CVSS?.nvd?.V3Vector || vuln.CVSS?.redhat?.V3Vector || null,
            title: vuln.Title || null,
            description: vuln.Description || null,
            publishedDate: vuln.PublishedDate ? new Date(vuln.PublishedDate) : null,
            lastModifiedDate: vuln.LastModifiedDate ? new Date(vuln.LastModifiedDate) : null,
            references: vuln.References || null,
          }));

          await prisma.trivyVulnerability.createMany({ data: vulnerabilities });
        }

        // Save misconfigurations
        if (result.Misconfigurations && result.Misconfigurations.length > 0) {
          const misconfigs = result.Misconfigurations.map((misconf: any) => ({
            trivyResultsId: trivyResult.id,
            targetName: result.Target || '',
            targetClass: result.Class || null,
            targetType: result.Type || null,
            checkId: misconf.ID || '',
            avdId: misconf.AVDID || null,
            title: misconf.Title || '',
            description: misconf.Description || '',
            message: misconf.Message || '',
            namespace: misconf.Namespace || null,
            query: misconf.Query || null,
            severity: misconf.Severity || 'INFO',
            resolution: misconf.Resolution || null,
            status: misconf.Status || 'FAIL',
            startLine: misconf.CauseMetadata?.StartLine || null,
            endLine: misconf.CauseMetadata?.EndLine || null,
            code: misconf.CauseMetadata?.Code || null,
            primaryUrl: misconf.PrimaryURL || null,
            references: misconf.References || null,
          }));

          await prisma.trivyMisconfiguration.createMany({ data: misconfigs });
        }

        // Save secrets
        if (result.Secrets && result.Secrets.length > 0) {
          const secrets = result.Secrets.map((secret: any) => ({
            trivyResultsId: trivyResult.id,
            targetName: result.Target || '',
            ruleId: secret.RuleID || '',
            category: secret.Category || '',
            severity: secret.Severity || 'INFO',
            title: secret.Title || '',
            startLine: secret.StartLine || 0,
            endLine: secret.EndLine || 0,
            code: secret.Code || null,
            match: secret.Match || null,
            // Handle Layer being an object with DiffID
            layer: typeof secret.Layer === 'object' && secret.Layer ? 
                   (secret.Layer.DiffID || secret.Layer.Digest || JSON.stringify(secret.Layer)) : 
                   secret.Layer || null,
          }));

          await prisma.trivySecret.createMany({ data: secrets });
        }
      }
    }
  }

  private async saveDiveResults(metadataId: string, diveData: any): Promise<void> {
    const efficiencyScore = diveData.image?.efficiencyScore || 0;
    const sizeBytes = BigInt(diveData.image?.sizeBytes || 0);
    const wastedBytes = BigInt(diveData.image?.inefficientBytes || 0);
    const wastedPercent = sizeBytes > 0 ? Number(wastedBytes) / Number(sizeBytes) * 100 : 0;

    const diveResult = await prisma.diveResults.create({
      data: {
        scanMetadataId: metadataId,
        efficiencyScore,
        sizeBytes,
        wastedBytes,
        wastedPercent,
        inefficientFiles: diveData.image?.inefficientFiles || null,
        duplicateFiles: diveData.image?.duplicateFiles || null,
      }
    });

    if (diveData.layer && diveData.layer.length > 0) {
      const layers = diveData.layer.map((layer: any, index: number) => ({
        diveResultsId: diveResult.id,
        layerId: layer.id || '',
        layerIndex: index,
        digest: layer.digest || '',
        sizeBytes: BigInt(layer.sizeBytes || 0),
        command: layer.command || null,
        addedFiles: layer.addedFiles || 0,
        modifiedFiles: layer.modifiedFiles || 0,
        removedFiles: layer.removedFiles || 0,
        wastedBytes: BigInt(layer.wastedBytes || 0),
        fileDetails: layer.fileDetails || null,
      }));

      await prisma.diveLayer.createMany({ data: layers });
    }
  }

  private async saveSyftResults(metadataId: string, syftData: any): Promise<void> {
    const syftResult = await prisma.syftResults.create({
      data: {
        scanMetadataId: metadataId,
        schemaVersion: syftData.schema?.version || null,
        bomFormat: syftData.descriptor?.name || null,
        specVersion: syftData.specVersion || null,
        serialNumber: syftData.serialNumber || null,
        packagesCount: syftData.artifacts?.length || 0,
        filesAnalyzed: syftData.source?.target?.imageSize || 0,
        source: syftData.source || null,
        distro: syftData.distro || null,
      }
    });

    if (syftData.artifacts && syftData.artifacts.length > 0) {
      const packages = syftData.artifacts.map((artifact: any) => {
        // Extract CPE string - handle various formats
        let cpeString: string | null = null;
        if (artifact.cpes && artifact.cpes.length > 0) {
          const firstCpe = artifact.cpes[0];
          if (typeof firstCpe === 'string') {
            cpeString = firstCpe;
          } else if (typeof firstCpe === 'object' && firstCpe.cpe) {
            cpeString = firstCpe.cpe;
          } else if (typeof firstCpe === 'object' && firstCpe.value) {
            cpeString = firstCpe.value;
          }
        }
        
        return {
          syftResultsId: syftResult.id,
          packageId: artifact.id || '',
          name: artifact.name || 'unknown',
          version: artifact.version || '',
          type: artifact.type || 'unknown',
          foundBy: artifact.foundBy || null,
          purl: artifact.purl || null,
          cpe: cpeString,
          language: artifact.language || null,
          licenses: artifact.licenses || null,
          size: artifact.metadata?.installedSize ? BigInt(artifact.metadata.installedSize) : null,
          locations: artifact.locations || null,
          layerId: artifact.locations?.[0]?.layerID || null,
          metadata: artifact.metadata || null,
        };
      });

      await prisma.syftPackage.createMany({ data: packages });
    }
  }

  private async saveDockleResults(metadataId: string, dockleData: any): Promise<void> {
    const dockleResult = await prisma.dockleResults.create({
      data: {
        scanMetadataId: metadataId,
        summary: dockleData.summary || null,
      }
    });

    if (dockleData.details && dockleData.details.length > 0) {
      const violations = dockleData.details.map((detail: any) => ({
        dockleResultsId: dockleResult.id,
        code: detail.code || '',
        title: detail.title || '',
        level: detail.level || 'INFO',
        alerts: detail.alerts || null,
      }));

      await prisma.dockleViolation.createMany({ data: violations });
    }
  }

  private async saveOsvResults(metadataId: string, osvData: any): Promise<void> {
    const osvResult = await prisma.osvResults.create({
      data: {
        scanMetadataId: metadataId,
      }
    });

    const vulnerabilities: any[] = [];
    
    if (osvData.results && osvData.results.length > 0) {
      for (const result of osvData.results) {
        if (result.packages) {
          for (const pkg of result.packages) {
            if (pkg.vulnerabilities) {
              for (const vuln of pkg.vulnerabilities) {
                vulnerabilities.push({
                  osvResultsId: osvResult.id,
                  osvId: vuln.id || 'UNKNOWN',
                  aliases: vuln.aliases || null,
                  packageName: pkg.package?.name || 'unknown',
                  packageEcosystem: pkg.package?.ecosystem || 'unknown',
                  packageVersion: pkg.package?.version || '',
                  packagePurl: pkg.package?.purl || null,
                  summary: vuln.summary || null,
                  details: vuln.details || null,
                  severity: vuln.severity || null,
                  fixed: vuln.affected?.[0]?.ranges?.[0]?.events?.find((e: any) => e.fixed)?.fixed || null,
                  affected: vuln.affected || null,
                  published: vuln.published ? new Date(vuln.published) : null,
                  modified: vuln.modified ? new Date(vuln.modified) : null,
                  withdrawn: vuln.withdrawn ? new Date(vuln.withdrawn) : null,
                  references: vuln.references || null,
                  databaseSpecific: vuln.database_specific || null,
                });
              }
            }
          }
        }
      }
    }

    if (vulnerabilities.length > 0) {
      await prisma.osvVulnerability.createMany({ data: vulnerabilities });
    }
  }

  async calculateAggregatedData(scanId: string, reports: ScanReports, metadataId?: string): Promise<void> {
    const aggregates: AggregatedData = {};
    const vulnCount: VulnerabilityCount = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    let totalCvssScore = 0;
    let cvssCount = 0;
    
    // Aggregate vulnerabilities from Trivy
    if (reports.trivy?.Results) {
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
    }
    
    // Aggregate vulnerabilities from Grype
    if (reports.grype?.matches) {
      for (const match of reports.grype.matches) {
        // Grype uses capitalized severity levels
        const severity = match.vulnerability?.severity?.toLowerCase();
        if (severity && vulnCount.hasOwnProperty(severity)) {
          vulnCount[severity as keyof VulnerabilityCount]++;
        }
        
        // Get CVSS score from Grype
        if (match.vulnerability?.cvss) {
          for (const cvss of match.vulnerability.cvss) {
            if (cvss.metrics?.baseScore) {
              totalCvssScore += cvss.metrics.baseScore;
              cvssCount++;
              break; // Use first available score
            }
          }
        }
      }
    }
    
    // Aggregate vulnerabilities from OSV
    if (reports.osv?.results) {
      for (const result of reports.osv.results) {
        if (result.packages) {
          for (const pkg of result.packages) {
            if (pkg.vulnerabilities) {
              for (const vuln of pkg.vulnerabilities) {
                // OSV uses severity arrays with CVSS scores
                if (vuln.severity) {
                  for (const sev of vuln.severity) {
                    if (sev.type === 'CVSS_V3' && sev.score) {
                      const score = parseFloat(sev.score);
                      totalCvssScore += score;
                      cvssCount++;
                      
                      // Map CVSS score to severity
                      if (score >= 9.0) vulnCount.critical++;
                      else if (score >= 7.0) vulnCount.high++;
                      else if (score >= 4.0) vulnCount.medium++;
                      else if (score >= 0.1) vulnCount.low++;
                      else vulnCount.info++;
                      break;
                    }
                  }
                } else {
                  // If no severity score, count as info
                  vulnCount.info++;
                }
              }
            }
          }
        }
      }
    }

    // Only set vulnerability count if we found any vulnerabilities
    if (vulnCount.critical > 0 || vulnCount.high > 0 || vulnCount.medium > 0 || 
        vulnCount.low > 0 || vulnCount.info > 0) {
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
      
      // Only update metadata if we have a metadataId
      if (metadataId) {
        await prisma.scanMetadata.update({
          where: { id: metadataId },
          data: metadataUpdateData
        });
      }
    }
  }

  /**
   * Populate normalized finding tables from scan reports
   */
  async populateNormalizedFindings(scanId: string, reports: ScanReports): Promise<void> {
    try {
      // Process vulnerability findings
      await this.populateVulnerabilityFindings(scanId, reports);
      
      // Process package findings
      await this.populatePackageFindings(scanId, reports);
      
      // Process compliance findings
      await this.populateComplianceFindings(scanId, reports);
      
      // Process efficiency findings
      await this.populateEfficiencyFindings(scanId, reports);
      
      // Create cross-scanner correlations
      await this.createFindingCorrelations(scanId);
    } catch (error) {
      console.error('Error populating normalized findings:', error);
      // Continue even if normalization fails - we still have the raw JSON data
    }
  }

  private async populateVulnerabilityFindings(scanId: string, reports: ScanReports): Promise<void> {
    const findings: any[] = [];
    
    // Process Trivy results
    if (reports.trivy?.Results) {
      for (const result of reports.trivy.Results) {
        if (result.Vulnerabilities) {
          for (const vuln of result.Vulnerabilities) {
            findings.push({
              scanId,
              source: 'trivy',
              cveId: vuln.VulnerabilityID || vuln.PkgID,
              packageName: vuln.PkgName || vuln.PkgID,
              installedVersion: vuln.InstalledVersion || null,
              fixedVersion: vuln.FixedVersion || null,
              severity: this.mapSeverity(vuln.Severity),
              cvssScore: vuln.CVSS?.nvd?.V3Score || vuln.CVSS?.redhat?.V3Score || null,
              dataSource: vuln.DataSource?.Name || null,
              vulnerabilityUrl: vuln.PrimaryURL || null,
              title: vuln.Title || null,
              description: vuln.Description || null,
              publishedDate: vuln.PublishedDate ? new Date(vuln.PublishedDate) : null,
              lastModified: vuln.LastModifiedDate ? new Date(vuln.LastModifiedDate) : null,
              filePath: result.Target || null,
              packageType: result.Type || null,
              rawFinding: vuln
            });
          }
        }
      }
    }
    
    // Process Grype results
    if (reports.grype?.matches) {
      for (const match of reports.grype.matches) {
        const vuln = match.vulnerability;
        findings.push({
          scanId,
          source: 'grype',
          cveId: vuln.id,
          packageName: match.artifact.name,
          installedVersion: match.artifact.version || null,
          fixedVersion: vuln.fix?.versions?.[0] || null,
          severity: this.mapSeverity(vuln.severity),
          cvssScore: vuln.cvss?.[0]?.metrics?.baseScore || null,
          dataSource: vuln.dataSource || null,
          vulnerabilityUrl: vuln.urls?.[0] || null,
          title: null,
          description: vuln.description || null,
          filePath: match.artifact.locations?.[0]?.path || null,
          layerId: match.artifact.locations?.[0]?.layerID || null,
          packageType: match.artifact.type || null,
          rawFinding: match
        });
      }
    }
    
    // Process OSV results
    if (reports.osv?.results) {
      for (const result of reports.osv.results) {
        for (const pkg of result.packages || []) {
          for (const vuln of pkg.vulnerabilities || []) {
            findings.push({
              scanId,
              source: 'osv',
              cveId: vuln.id,
              packageName: pkg.package.name,
              installedVersion: pkg.package.version || null,
              fixedVersion: null,
              severity: this.mapOsvSeverity(vuln.severity),
              cvssScore: this.extractOsvScore(vuln.severity),
              dataSource: vuln.database_specific?.source || 'osv',
              vulnerabilityUrl: vuln.references?.[0]?.url || null,
              title: vuln.summary || null,
              description: vuln.details || null,
              publishedDate: vuln.published ? new Date(vuln.published) : null,
              lastModified: vuln.modified ? new Date(vuln.modified) : null,
              filePath: result.source?.path || null,
              packageType: pkg.package.ecosystem || null,
              rawFinding: vuln
            });
          }
        }
      }
    }
    
    if (findings.length > 0) {
      await prisma.scanVulnerabilityFinding.createMany({ data: findings });
    }
  }

  private formatLicense(license: any): string | null {
    if (!license) return null;
    if (typeof license === 'string') return license;
    if (Array.isArray(license)) {
      const formatted = license.map(l => this.formatLicense(l)).filter(Boolean);
      if (formatted.length > 0) {
        return formatted.join(', ');
      }
      return null;
    }
    if (typeof license === 'object') {
      // Handle common license object structures - prioritize actual license value
      if (license.value) {
        return license.value;  // Syft format: {type: "declared", value: "MIT"}
      }
      if (license.spdxExpression) return license.spdxExpression;  // SPDX expression
      if (license.name) return license.name;
      if (license.license) return license.license;
      if (license.expression) return license.expression;
      // Skip 'type' field as it usually contains "declared" which is not the actual license
      // Try to extract first meaningful string value from object
      const values = Object.values(license);
      const firstString = values.find(v => typeof v === 'string' && v !== 'declared');
      if (firstString) return firstString as string;
    }
    return null;
  }

  private async populatePackageFindings(scanId: string, reports: ScanReports): Promise<void> {
    const findings: any[] = [];
    
    // Process Syft results
    if (reports.syft?.artifacts) {
      for (const artifact of reports.syft.artifacts) {
        const formattedLicense = this.formatLicense(artifact.licenses);

        findings.push({
          scanId,
          source: 'syft',
          packageName: artifact.name,
          version: artifact.version || null,
          type: artifact.type || 'unknown',
          purl: artifact.purl || null,
          license: formattedLicense || null,
          vendor: artifact.vendor || null,
          publisher: artifact.publisher || null,
          ecosystem: artifact.language || null,
          language: artifact.language || null,
          filePath: artifact.locations?.[0]?.path || null,
          layerId: artifact.locations?.[0]?.layerID || null,
          metadata: artifact.metadata || null,
          dependencies: artifact.upstreams || null
        });
      }
    }
    
    // Extract packages from Trivy SBOM data
    if (reports.trivy?.Results) {
      for (const result of reports.trivy.Results) {
        if (result.Packages) {
          for (const pkg of result.Packages) {
            findings.push({
              scanId,
              source: 'trivy',
              packageName: pkg.Name,
              version: pkg.Version || null,
              type: result.Type || 'unknown',
              purl: null,
              license: this.formatLicense(pkg.License) || null,
              vendor: null,
              publisher: null,
              ecosystem: result.Type || null,
              language: null,
              filePath: result.Target || null,
              layerId: null,
              metadata: pkg
            });
          }
        }
      }
    }
    
    if (findings.length > 0) {
      await prisma.scanPackageFinding.createMany({ data: findings });
    }
  }

  private async populateComplianceFindings(scanId: string, reports: ScanReports): Promise<void> {
    const findings: any[] = [];
    
    // Process Dockle results
    if (reports.dockle?.details) {
      for (const detail of reports.dockle.details) {
        for (const alert of detail.alerts || []) {
          findings.push({
            scanId,
            source: 'dockle',
            ruleId: detail.code,
            ruleName: detail.title,
            category: this.mapDockleCategory(detail.level),
            severity: this.mapDockleSeverity(detail.level),
            message: alert,
            description: detail.details || null,
            remediation: null,
            filePath: null,
            lineNumber: null,
            code: null,
            rawFinding: detail
          });
        }
      }
    }
    
    if (findings.length > 0) {
      await prisma.scanComplianceFinding.createMany({ data: findings });
    }
  }

  private async populateEfficiencyFindings(scanId: string, reports: ScanReports): Promise<void> {
    const findings: any[] = [];
    
    // Process Dive results
    if (reports.dive?.layer) {
      for (const layer of reports.dive.layer) {
        // Flag large layers
        const layerSizeBytes = Number(layer.sizeBytes || 0);
        if (layerSizeBytes > 50 * 1024 * 1024) { // > 50MB
          findings.push({
            scanId,
            source: 'dive',
            findingType: 'large_layer',
            severity: layerSizeBytes > 100 * 1024 * 1024 ? 'warning' : 'info',
            layerId: layer.id,
            layerIndex: layer.index,
            layerCommand: layer.command || null,
            sizeBytes: BigInt(layerSizeBytes),
            wastedBytes: null,
            efficiencyScore: null,
            description: `Large layer detected: ${(layerSizeBytes / 1024 / 1024).toFixed(2)}MB`,
            filePaths: null,
            rawFinding: layer
          });
        }
      }
    }
    
    if (findings.length > 0) {
      await prisma.scanEfficiencyFinding.createMany({ data: findings });
    }
  }

  private async createFindingCorrelations(scanId: string): Promise<void> {
    // Get all vulnerability findings for this scan
    const vulnFindings = await prisma.scanVulnerabilityFinding.findMany({
      where: { scanId },
      select: { cveId: true, source: true, severity: true }
    });
    
    // Group by CVE ID
    const correlations: Record<string, { sources: Set<string>; severities: string[] }> = {};
    for (const finding of vulnFindings) {
      if (!correlations[finding.cveId]) {
        correlations[finding.cveId] = {
          sources: new Set(),
          severities: []
        };
      }
      correlations[finding.cveId].sources.add(finding.source);
      correlations[finding.cveId].severities.push(finding.severity);
    }
    
    // Create correlation records
    const correlationData: any[] = [];
    for (const [cveId, data] of Object.entries(correlations)) {
      const sources = Array.from(data.sources);
      correlationData.push({
        scanId,
        findingType: 'vulnerability',
        correlationKey: cveId,
        sources,
        sourceCount: sources.length,
        confidenceScore: sources.length / 3, // 3 is max number of vuln scanners
        severity: this.getHighestSeverity(data.severities)
      });
    }
    
    if (correlationData.length > 0) {
      await prisma.scanFindingCorrelation.createMany({ data: correlationData });
    }
  }

  // Helper methods for mapping scanner data
  private mapSeverity(severity: string | undefined): any {
    const normalized = severity?.toUpperCase();
    switch (normalized) {
      case 'CRITICAL': return 'CRITICAL';
      case 'HIGH': return 'HIGH';
      case 'MEDIUM': return 'MEDIUM';
      case 'LOW': return 'LOW';
      case 'INFO':
      case 'NEGLIGIBLE':
      case 'UNKNOWN':
      default:
        return 'INFO';
    }
  }

  private mapOsvSeverity(severities: any[] | undefined): any {
    if (!severities || severities.length === 0) return 'INFO';
    
    for (const sev of severities) {
      if (sev.type === 'CVSS_V3' && sev.score) {
        const score = parseFloat(sev.score);
        if (score >= 9.0) return 'CRITICAL';
        if (score >= 7.0) return 'HIGH';
        if (score >= 4.0) return 'MEDIUM';
        if (score >= 0.1) return 'LOW';
      }
    }
    
    return 'INFO';
  }

  private extractOsvScore(severities: any[] | undefined): number | null {
    if (!severities || severities.length === 0) return null;
    
    for (const sev of severities) {
      if (sev.type === 'CVSS_V3' && sev.score) {
        return parseFloat(sev.score);
      }
    }
    
    return null;
  }

  private mapDockleCategory(level: string): string {
    switch (level) {
      case 'FATAL': return 'Security';
      case 'WARN': return 'BestPractice';
      case 'INFO': return 'CIS';
      default: return 'BestPractice';
    }
  }

  private mapDockleSeverity(level: string): any {
    switch (level) {
      case 'FATAL': return 'CRITICAL';
      case 'WARN': return 'MEDIUM';
      case 'INFO': return 'LOW';
      default: return 'INFO';
    }
  }

  private getHighestSeverity(severities: string[]): any {
    const order = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];
    for (const level of order) {
      if (severities.includes(level)) {
        return level;
      }
    }
    return 'INFO';
  }

  /**
   * Extract namespace from image name (e.g., "username/repo" -> "username")
   */
  private extractNamespaceFromImageName(imageName: string): string | null {
    const parts = imageName.split('/');
    if (parts.length > 1) {
      // Return all parts except the last one as namespace
      return parts.slice(0, -1).join('/');
    }
    return null;
  }

}