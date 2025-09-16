import { PrismaClient } from '@/generated/prisma';
import { RegistryService } from '../RegistryService';

export interface SyncOptions {
  intervalMs?: number;
  forceRefresh?: boolean;
  repositoryId?: string;
}

export class RegistrySyncService {
  private prisma: PrismaClient;
  private registryService: RegistryService;
  private syncIntervals: Map<string, NodeJS.Timeout> = new Map();
  private syncStatus: Map<string, { lastSync: Date; syncing: boolean; error?: string }> = new Map();
  
  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.registryService = new RegistryService(prisma);
  }
  
  /**
   * Start automatic syncing for all active repositories
   */
  async startAutoSync(intervalMs: number = 60000): Promise<void> {
    console.info('[RegistrySyncService] Starting auto-sync with interval:', intervalMs);
    
    const repositories = await this.registryService.listRepositories({
      includeInactive: false
    });
    
    for (const repository of repositories) {
      if (repository.status === 'ACTIVE') {
        this.startRepositorySync(repository.id, intervalMs);
      }
    }
  }
  
  /**
   * Start syncing for a specific repository
   */
  startRepositorySync(repositoryId: string, intervalMs: number = 60000): void {
    // Clear existing interval if any
    this.stopRepositorySync(repositoryId);
    
    console.info(`[RegistrySyncService] Starting sync for repository ${repositoryId} with interval ${intervalMs}ms`);
    
    // Perform initial sync
    this.syncRepository(repositoryId);
    
    // Set up interval for regular syncing
    const interval = setInterval(() => {
      this.syncRepository(repositoryId);
    }, intervalMs);
    
    this.syncIntervals.set(repositoryId, interval);
  }
  
  /**
   * Stop syncing for a specific repository
   */
  stopRepositorySync(repositoryId: string): void {
    const interval = this.syncIntervals.get(repositoryId);
    if (interval) {
      clearInterval(interval);
      this.syncIntervals.delete(repositoryId);
      console.info(`[RegistrySyncService] Stopped sync for repository ${repositoryId}`);
    }
  }
  
  /**
   * Stop all automatic syncing
   */
  stopAllSync(): void {
    console.info('[RegistrySyncService] Stopping all repository syncs');
    for (const [repositoryId] of this.syncIntervals) {
      this.stopRepositorySync(repositoryId);
    }
  }
  
  /**
   * Sync a specific repository - fetch all images and their tags
   */
  async syncRepository(repositoryId: string, forceRefresh: boolean = false): Promise<void> {
    const status = this.syncStatus.get(repositoryId) || { lastSync: new Date(0), syncing: false };
    
    if (status.syncing) {
      console.warn(`[RegistrySyncService] Repository ${repositoryId} is already syncing, skipping`);
      return;
    }
    
    this.syncStatus.set(repositoryId, { ...status, syncing: true, error: undefined });
    
    try {
      console.info(`[RegistrySyncService] Starting sync for repository ${repositoryId}`);
      
      // Get repository details
      const repository = await this.prisma.repository.findUnique({
        where: { id: repositoryId }
      });
      
      if (!repository || repository.status !== 'ACTIVE') {
        throw new Error(`Repository ${repositoryId} not found or not active`);
      }
      
      // List all images
      const images = await this.registryService.listImages(repositoryId, { 
        forceRefresh,
        limit: 1000 
      });
      
      console.info(`[RegistrySyncService] Found ${images.length} images in repository ${repository.name}`);
      
      // Fetch tags for each image
      let totalTags = 0;
      for (const image of images) {
        try {
          const tags = await this.registryService.getTags(
            repositoryId,
            image.namespace,
            image.name,
            { forceRefresh }
          );
          
          totalTags += tags.length;
          console.debug(`[RegistrySyncService] Found ${tags.length} tags for ${image.namespace ? `${image.namespace}/` : ''}${image.name}`);
          
          // Store tags in cache (already handled by RegistryService)
          // You could also store them in a separate tags table if needed
          
        } catch (error) {
          console.error(`[RegistrySyncService] Failed to fetch tags for ${image.name}:`, error);
        }
      }
      
      // Update repository with sync information
      await this.prisma.repository.update({
        where: { id: repositoryId },
        data: {
          lastTested: new Date(),
          repositoryCount: images.length
        }
      });
      
      console.info(`[RegistrySyncService] Sync completed for repository ${repository.name}: ${images.length} images, ${totalTags} total tags`);
      
      this.syncStatus.set(repositoryId, {
        lastSync: new Date(),
        syncing: false,
        error: undefined
      });
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[RegistrySyncService] Sync failed for repository ${repositoryId}:`, error);
      
      this.syncStatus.set(repositoryId, {
        lastSync: new Date(),
        syncing: false,
        error: errorMessage
      });
      
      // Update repository status if sync fails
      await this.prisma.repository.update({
        where: { id: repositoryId },
        data: {
          status: 'ERROR',
          lastTested: new Date()
        }
      }).catch(err => {
        console.error('Failed to update repository status:', err);
      });
    }
  }
  
  /**
   * Sync all active repositories
   */
  async syncAllRepositories(forceRefresh: boolean = false): Promise<void> {
    const repositories = await this.registryService.listRepositories({
      includeInactive: false
    });
    
    console.info(`[RegistrySyncService] Syncing ${repositories.length} repositories`);
    
    // Sync repositories in parallel with concurrency limit
    const concurrencyLimit = 3;
    const chunks = [];
    
    for (let i = 0; i < repositories.length; i += concurrencyLimit) {
      chunks.push(repositories.slice(i, i + concurrencyLimit));
    }
    
    for (const chunk of chunks) {
      await Promise.allSettled(
        chunk.map(repo => {
          if (repo.status === 'ACTIVE') {
            return this.syncRepository(repo.id, forceRefresh);
          }
          return Promise.resolve();
        })
      );
    }
  }
  
  /**
   * Get sync status for a repository
   */
  getSyncStatus(repositoryId: string): { lastSync: Date; syncing: boolean; error?: string } | undefined {
    return this.syncStatus.get(repositoryId);
  }
  
  /**
   * Get all sync statuses
   */
  getAllSyncStatuses(): Map<string, { lastSync: Date; syncing: boolean; error?: string }> {
    return new Map(this.syncStatus);
  }
  
  /**
   * Check if a repository is currently syncing
   */
  isSyncing(repositoryId: string): boolean {
    const status = this.syncStatus.get(repositoryId);
    return status?.syncing || false;
  }
  
  /**
   * Get recent tags across all repositories
   */
  async getRecentTags(limit: number = 50): Promise<Array<{
    repositoryId: string;
    repositoryName: string;
    image: string;
    tag: string;
    pushed: Date;
    size?: number;
  }>> {
    const repositories = await this.registryService.listRepositories({
      includeInactive: false
    });
    
    const allTags: Array<{
      repositoryId: string;
      repositoryName: string;
      image: string;
      tag: string;
      pushed: Date;
      size?: number;
    }> = [];
    
    for (const repository of repositories) {
      if (repository.status !== 'ACTIVE') continue;
      
      try {
        const images = await this.registryService.listImages(repository.id, { limit: 10 });
        
        for (const image of images) {
          const tags = await this.registryService.getTags(
            repository.id,
            image.namespace,
            image.name
          );
          
          for (const tag of tags) {
            allTags.push({
              repositoryId: repository.id,
              repositoryName: repository.name,
              image: `${image.namespace ? `${image.namespace}/` : ''}${image.name}`,
              tag: tag.name,
              pushed: tag.created || new Date(),
              size: tag.size || 0
            });
          }
        }
      } catch (error) {
        console.error(`Failed to get tags for repository ${repository.name}:`, error);
      }
    }
    
    // Sort by pushed date and return top N
    return allTags
      .sort((a, b) => b.pushed.getTime() - a.pushed.getTime())
      .slice(0, limit);
  }
}