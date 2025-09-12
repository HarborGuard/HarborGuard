import { PrismaClient, type Repository, type RepositoryImageMetadata, type SyncStatus } from '@/generated/prisma';
import type { RegistryImage, ImageTag, ImageMetadata, RegistryCapability } from '../types';
import { RegistryProviderFactory } from '../providers/RegistryProviderFactory';

interface CacheConfig {
  memoryTTL: number; // milliseconds
  databaseTTL: number; // milliseconds
  maxMemoryEntries: number;
  enableL1Cache: boolean;
  enableL2Cache: boolean;
}

interface CacheKey {
  repositoryId: string;
  operation: 'list' | 'metadata' | 'tags' | 'search';
  params: Record<string, any>;
}

interface CacheEntry<T> {
  data: T;
  timestamp: Date;
  ttl: number;
  syncStatus: SyncStatus;
}

export class RegistryMetadataCache {
  private prisma: PrismaClient;
  private config: CacheConfig;
  
  // L1 Cache: In-memory cache
  private memoryCache = new Map<string, CacheEntry<any>>();
  private cacheAccessOrder: string[] = [];
  
  constructor(
    prisma: PrismaClient,
    config: Partial<CacheConfig> = {}
  ) {
    this.prisma = prisma;
    this.config = {
      memoryTTL: 5 * 60 * 1000, // 5 minutes
      databaseTTL: 60 * 60 * 1000, // 1 hour
      maxMemoryEntries: 1000,
      enableL1Cache: true,
      enableL2Cache: true,
      ...config
    };
  }
  
  private generateCacheKey(key: CacheKey): string {
    const paramsStr = Object.entries(key.params)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${JSON.stringify(v)}`)
      .join('|');
    
    return `${key.repositoryId}:${key.operation}:${paramsStr}`;
  }
  
  private isExpired(entry: CacheEntry<any>): boolean {
    return Date.now() - entry.timestamp.getTime() > entry.ttl;
  }
  
  private updateAccessOrder(cacheKey: string): void {
    const index = this.cacheAccessOrder.indexOf(cacheKey);
    if (index > -1) {
      this.cacheAccessOrder.splice(index, 1);
    }
    this.cacheAccessOrder.push(cacheKey);
  }
  
  private evictOldestEntries(): void {
    while (this.memoryCache.size >= this.config.maxMemoryEntries) {
      const oldestKey = this.cacheAccessOrder.shift();
      if (oldestKey) {
        this.memoryCache.delete(oldestKey);
      }
    }
  }
  
  // L1 Cache Operations (Memory)
  private getFromL1<T>(cacheKey: string): T | null {
    if (!this.config.enableL1Cache) return null;
    
    const entry = this.memoryCache.get(cacheKey);
    if (!entry || this.isExpired(entry)) {
      this.memoryCache.delete(cacheKey);
      return null;
    }
    
    this.updateAccessOrder(cacheKey);
    return entry.data;
  }
  
  private setToL1<T>(cacheKey: string, data: T, syncStatus: SyncStatus = 'COMPLETED'): void {
    if (!this.config.enableL1Cache) return;
    
    this.evictOldestEntries();
    
    const entry: CacheEntry<T> = {
      data,
      timestamp: new Date(),
      ttl: this.config.memoryTTL,
      syncStatus
    };
    
    this.memoryCache.set(cacheKey, entry);
    this.updateAccessOrder(cacheKey);
  }
  
  // L2 Cache Operations (Database)
  private async getFromL2<T>(cacheKey: string): Promise<T | null> {
    if (!this.config.enableL2Cache) return null;
    
    try {
      // For now, just return null to skip L2 caching
      // TODO: Implement proper L2 caching with current schema
      return null;
    } catch (error) {
      console.warn('L2 cache read error:', error);
      return null;
    }
  }
  
  private async setToL2<T>(
    repositoryId: string, 
    cacheKey: string, 
    data: T, 
    syncStatus: SyncStatus = 'COMPLETED'
  ): Promise<void> {
    if (!this.config.enableL2Cache) return;
    
    try {
      // For now, just skip L2 caching
      // TODO: Implement proper L2 caching with current schema
      return;
    } catch (error) {
      console.warn('L2 cache write error:', error);
    }
  }
  
  // L3 Operations (Registry API)
  private async fetchFromRegistry<T>(
    repository: Repository,
    operation: string,
    params: Record<string, any>
  ): Promise<T> {
    const provider = RegistryProviderFactory.createFromRepository(repository);
    
    switch (operation) {
      case 'list':
        return provider.listImages(params) as Promise<T>;
        
      case 'metadata':
        return provider.getImageMetadata(params.namespace, params.imageName) as Promise<T>;
        
      case 'tags':
        return provider.getTags(params.namespace, params.imageName) as Promise<T>;
        
      case 'search':
        if (!provider.getSupportedCapabilities().includes('SEARCH')) {
          throw new Error(`Search not supported by ${provider.getProviderName()}`);
        }
        return provider.searchImages(params.query, params) as Promise<T>;
        
      default:
        throw new Error(`Unsupported operation: ${operation}`);
    }
  }
  
  // Public API Methods
  async listImages(
    repository: Repository, 
    options: { 
      limit?: number; 
      offset?: number; 
      namespace?: string; 
      query?: string;
      forceRefresh?: boolean;
    } = {}
  ): Promise<RegistryImage[]> {
    const cacheKey = this.generateCacheKey({
      repositoryId: repository.id,
      operation: 'list',
      params: { limit: options.limit, offset: options.offset, namespace: options.namespace, query: options.query }
    });
    
    if (!options.forceRefresh) {
      // Try L1 cache
      const l1Result = this.getFromL1<RegistryImage[]>(cacheKey);
      if (l1Result) return l1Result;
      
      // Try L2 cache
      const l2Result = await this.getFromL2<RegistryImage[]>(cacheKey);
      if (l2Result) return l2Result;
    }
    
    // Fetch from registry (L3)
    try {
      const images = await this.fetchFromRegistry<RegistryImage[]>(
        repository, 
        'list', 
        options
      );
      
      // Cache results
      this.setToL1(cacheKey, images);
      await this.setToL2(repository.id, cacheKey, images);
      
      return images;
    } catch (error) {
      // Try to return stale data if available
      const staleData = await this.getFromL2<RegistryImage[]>(cacheKey);
      if (staleData) {
        console.warn('Returning stale data due to registry error:', error);
        return staleData;
      }
      throw error;
    }
  }
  
  async getImageMetadata(
    repository: Repository,
    namespace: string | null,
    imageName: string,
    options: { forceRefresh?: boolean } = {}
  ): Promise<ImageMetadata> {
    const cacheKey = this.generateCacheKey({
      repositoryId: repository.id,
      operation: 'metadata',
      params: { namespace, imageName }
    });
    
    if (!options.forceRefresh) {
      const l1Result = this.getFromL1<ImageMetadata>(cacheKey);
      if (l1Result) return l1Result;
      
      const l2Result = await this.getFromL2<ImageMetadata>(cacheKey);
      if (l2Result) return l2Result;
    }
    
    try {
      const metadata = await this.fetchFromRegistry<ImageMetadata>(
        repository,
        'metadata',
        { namespace, imageName }
      );
      
      this.setToL1(cacheKey, metadata);
      await this.setToL2(repository.id, cacheKey, metadata);
      
      return metadata;
    } catch (error) {
      const staleData = await this.getFromL2<ImageMetadata>(cacheKey);
      if (staleData) {
        console.warn('Returning stale metadata due to registry error:', error);
        return staleData;
      }
      throw error;
    }
  }
  
  async getTags(
    repository: Repository,
    namespace: string | null,
    imageName: string,
    options: { forceRefresh?: boolean } = {}
  ): Promise<ImageTag[]> {
    const cacheKey = this.generateCacheKey({
      repositoryId: repository.id,
      operation: 'tags',
      params: { namespace, imageName }
    });
    
    if (!options.forceRefresh) {
      const l1Result = this.getFromL1<ImageTag[]>(cacheKey);
      if (l1Result) return l1Result;
      
      const l2Result = await this.getFromL2<ImageTag[]>(cacheKey);
      if (l2Result) return l2Result;
    }
    
    try {
      const tags = await this.fetchFromRegistry<ImageTag[]>(
        repository,
        'tags',
        { namespace, imageName }
      );
      
      this.setToL1(cacheKey, tags);
      await this.setToL2(repository.id, cacheKey, tags);
      
      return tags;
    } catch (error) {
      const staleData = await this.getFromL2<ImageTag[]>(cacheKey);
      if (staleData) {
        console.warn('Returning stale tags due to registry error:', error);
        return staleData;
      }
      throw error;
    }
  }
  
  async searchImages(
    repository: Repository,
    query: string,
    options: { 
      limit?: number; 
      offset?: number;
      forceRefresh?: boolean;
    } = {}
  ): Promise<RegistryImage[]> {
    const cacheKey = this.generateCacheKey({
      repositoryId: repository.id,
      operation: 'search',
      params: { query, limit: options.limit, offset: options.offset }
    });
    
    if (!options.forceRefresh) {
      const l1Result = this.getFromL1<RegistryImage[]>(cacheKey);
      if (l1Result) return l1Result;
      
      const l2Result = await this.getFromL2<RegistryImage[]>(cacheKey);
      if (l2Result) return l2Result;
    }
    
    try {
      const results = await this.fetchFromRegistry<RegistryImage[]>(
        repository,
        'search',
        { query, ...options }
      );
      
      this.setToL1(cacheKey, results);
      await this.setToL2(repository.id, cacheKey, results);
      
      return results;
    } catch (error) {
      const staleData = await this.getFromL2<RegistryImage[]>(cacheKey);
      if (staleData) {
        console.warn('Returning stale search results due to registry error:', error);
        return staleData;
      }
      throw error;
    }
  }
  
  // Cache Management
  async invalidateCache(repositoryId: string, operation?: string): Promise<void> {
    // Clear L1 cache
    if (operation) {
      const keysToDelete = Array.from(this.memoryCache.keys()).filter(key => 
        key.startsWith(`${repositoryId}:${operation}:`)
      );
      keysToDelete.forEach(key => {
        this.memoryCache.delete(key);
        const index = this.cacheAccessOrder.indexOf(key);
        if (index > -1) this.cacheAccessOrder.splice(index, 1);
      });
    } else {
      const keysToDelete = Array.from(this.memoryCache.keys()).filter(key => 
        key.startsWith(`${repositoryId}:`)
      );
      keysToDelete.forEach(key => {
        this.memoryCache.delete(key);
        const index = this.cacheAccessOrder.indexOf(key);
        if (index > -1) this.cacheAccessOrder.splice(index, 1);
      });
    }
    
    // Clear L2 cache
    // Note: We don't have a cacheKey field to selectively invalidate by operation,
    // so we always clear all cache for the repository
    await this.prisma.repositoryImageMetadata.deleteMany({
      where: { repositoryId }
    });
  }
  
  async warmupCache(repository: Repository): Promise<void> {
    try {
      // Warm up with basic image list
      await this.listImages(repository, { limit: 50 });
      
      console.log(`Cache warmed up for repository: ${repository.name}`);
    } catch (error) {
      console.warn(`Failed to warm up cache for repository: ${repository.name}`, error);
    }
  }
  
  // Maintenance operations
  async cleanupExpiredCache(): Promise<void> {
    // Clean L1 cache
    const expiredKeys = Array.from(this.memoryCache.entries())
      .filter(([_, entry]) => this.isExpired(entry))
      .map(([key]) => key);
    
    expiredKeys.forEach(key => {
      this.memoryCache.delete(key);
      const index = this.cacheAccessOrder.indexOf(key);
      if (index > -1) this.cacheAccessOrder.splice(index, 1);
    });
    
    // Clean L2 cache - delete expired entries
    const cutoffDate = new Date();
    await this.prisma.repositoryImageMetadata.deleteMany({
      where: {
        expiresAt: { lt: cutoffDate }
      }
    });
  }
  
  getCacheStats(): {
    l1Size: number;
    l1MaxSize: number;
    l1HitRate: number;
  } {
    return {
      l1Size: this.memoryCache.size,
      l1MaxSize: this.config.maxMemoryEntries,
      l1HitRate: 0 // Would need hit/miss tracking for accurate calculation
    };
  }
}