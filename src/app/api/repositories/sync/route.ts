import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { RegistrySyncService } from '@/lib/registry/sync/RegistrySyncService';
import { apiError } from '@/lib/api-utils';

// Create a singleton instance
let syncService: RegistrySyncService | null = null;

function getSyncService() {
  if (!syncService) {
    syncService = new RegistrySyncService(prisma);
    // Start auto-sync with 5 minute interval by default
    syncService.startAutoSync(5 * 60 * 1000);
  }
  return syncService;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { repositoryId, forceRefresh = false, action = 'sync' } = body;
    
    const service = getSyncService();
    
    if (action === 'sync') {
      if (repositoryId) {
        // Sync specific repository
        await service.syncRepository(repositoryId, forceRefresh);
        const status = service.getSyncStatus(repositoryId);
        
        return NextResponse.json({
          success: true,
          message: `Repository sync initiated`,
          status
        });
      } else {
        // Sync all repositories
        await service.syncAllRepositories(forceRefresh);
        const statuses = Object.fromEntries(service.getAllSyncStatuses());
        
        return NextResponse.json({
          success: true,
          message: 'All repositories sync initiated',
          statuses
        });
      }
    } else if (action === 'start') {
      // Start auto-sync for a repository
      const intervalMs = body.intervalMs || 60000;
      
      if (repositoryId) {
        service.startRepositorySync(repositoryId, intervalMs);
        return NextResponse.json({
          success: true,
          message: `Auto-sync started for repository with ${intervalMs}ms interval`
        });
      } else {
        await service.startAutoSync(intervalMs);
        return NextResponse.json({
          success: true,
          message: `Auto-sync started for all repositories with ${intervalMs}ms interval`
        });
      }
    } else if (action === 'stop') {
      // Stop auto-sync
      if (repositoryId) {
        service.stopRepositorySync(repositoryId);
        return NextResponse.json({
          success: true,
          message: 'Auto-sync stopped for repository'
        });
      } else {
        service.stopAllSync();
        return NextResponse.json({
          success: true,
          message: 'Auto-sync stopped for all repositories'
        });
      }
    }
    
    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    );
  } catch (error) {
    return apiError(error, 'Sync operation failed');
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const repositoryId = searchParams.get('repositoryId');
    const includeRecentTags = searchParams.get('recentTags') === 'true';
    
    const service = getSyncService();
    
    if (repositoryId) {
      // Get status for specific repository
      const status = service.getSyncStatus(repositoryId);
      return NextResponse.json({
        repositoryId,
        status: status || { lastSync: null, syncing: false }
      });
    } else if (includeRecentTags) {
      // Get recent tags across all repositories
      const recentTags = await service.getRecentTags(50);
      return NextResponse.json({
        recentTags
      });
    } else {
      // Get all statuses
      const statuses = Object.fromEntries(service.getAllSyncStatuses());
      return NextResponse.json({
        statuses
      });
    }
  } catch (error) {
    return apiError(error, 'Failed to get sync status');
  }
}