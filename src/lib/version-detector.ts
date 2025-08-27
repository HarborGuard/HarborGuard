/**
 * Version detection utilities for Harbor Guard
 * Checks if a newer version is available from ghcr.io/harborguard/harborguard:latest
 */

import { logger } from './logger';

interface VersionInfo {
  current: string;
  latest?: string;
  hasUpdate: boolean;
  lastChecked: Date;
  error?: string;
}

interface DockerManifest {
  tag: string;
  name: string;
  architecture: string;
  mediaType: string;
  digest: string;
  size: number;
}

interface DockerTagsResponse {
  name: string;
  tags: string[];
}

class VersionDetector {
  private static instance: VersionDetector;
  private readonly REGISTRY_URL = 'https://ghcr.io';
  private readonly IMAGE_NAME = 'harborguard/harborguard';
  private readonly CHECK_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours
  private cachedVersionInfo: VersionInfo | null = null;

  private constructor() {}

  static getInstance(): VersionDetector {
    if (!VersionDetector.instance) {
      VersionDetector.instance = new VersionDetector();
    }
    return VersionDetector.instance;
  }

  /**
   * Get current application version
   */
  getCurrentVersion(): string {
    // Try environment variable first (set during build)
    if (process.env.npm_package_version) {
      return process.env.npm_package_version;
    }
    
    // Try to read from package.json version (fallback)
    if (process.env.NEXT_PUBLIC_APP_VERSION) {
      return process.env.NEXT_PUBLIC_APP_VERSION;
    }

    // Development fallback
    return process.env.NODE_ENV === 'development' ? '0.1.0-dev' : '0.1.0';
  }

  /**
   * Check if we should perform a version check
   */
  private shouldCheck(): boolean {
    if (!this.cachedVersionInfo) return true;
    
    const timeSinceLastCheck = Date.now() - this.cachedVersionInfo.lastChecked.getTime();
    return timeSinceLastCheck > this.CHECK_INTERVAL;
  }

  /**
   * Fetch latest version from GitHub Container Registry
   */
  private async fetchLatestVersion(): Promise<string | null> {
    try {
      // Use GitHub Container Registry API to get manifest info
      const tagsUrl = `https://api.github.com/users/harborguard/packages/container/harborguard/versions`;
      
      logger.debug(`Checking for latest version at: ${tagsUrl}`);
      
      const response = await fetch(tagsUrl, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Harbor-Guard-App'
        },
        // Add timeout to prevent hanging
        signal: AbortSignal.timeout(10000)
      });

      if (!response.ok) {
        // Fallback: try Docker Hub API or simple version check
        return await this.fetchVersionFallback();
      }

      const versions = await response.json();
      
      // Find the latest version (assumes first item is latest)
      if (versions && versions.length > 0) {
        const latestVersion = versions[0];
        // Extract version from tags
        const versionTag = latestVersion.metadata?.container?.tags?.find((tag: string) => 
          tag.match(/^\d+\.\d+\.\d+.*$/) || tag === 'latest'
        );
        
        if (versionTag && versionTag !== 'latest') {
          return versionTag;
        }
        
        // If we only have 'latest', try to get commit info
        return latestVersion.name?.substring(0, 8) || 'latest';
      }

      return null;
    } catch (error) {
      logger.warn('Failed to fetch version from GitHub API:', error);
      return await this.fetchVersionFallback();
    }
  }

  /**
   * Fallback version checking method
   */
  private async fetchVersionFallback(): Promise<string | null> {
    try {
      // Simple approach: check Docker registry API directly
      const manifestUrl = `${this.REGISTRY_URL}/v2/${this.IMAGE_NAME}/manifests/latest`;
      
      const response = await fetch(manifestUrl, {
        headers: {
          'Accept': 'application/vnd.docker.distribution.manifest.v2+json'
        },
        signal: AbortSignal.timeout(5000)
      });

      if (response.ok) {
        const etag = response.headers.get('Docker-Content-Digest') || 
                     response.headers.get('Etag');
        
        if (etag) {
          // Return a shortened digest as version identifier
          return etag.replace(/"/g, '').substring(0, 12);
        }
      }
    } catch (error) {
      logger.debug('Fallback version check failed:', error);
    }
    
    return null;
  }

  /**
   * Compare version strings (semantic versioning)
   */
  private compareVersions(current: string, latest: string): boolean {
    // Handle development versions
    if (current.includes('dev')) return true;
    
    // Handle digest-based versions
    if (!current.match(/^\d/) || !latest.match(/^\d/)) {
      return current !== latest;
    }

    try {
      const currentParts = current.split('.').map(num => parseInt(num) || 0);
      const latestParts = latest.split('.').map(num => parseInt(num) || 0);
      
      // Pad arrays to same length
      while (currentParts.length < 3) currentParts.push(0);
      while (latestParts.length < 3) latestParts.push(0);
      
      for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
        const curr = currentParts[i] || 0;
        const lat = latestParts[i] || 0;
        
        if (lat > curr) return true;
        if (curr > lat) return false;
      }
      
      return false; // Versions are equal
    } catch (error) {
      // If parsing fails, assume update is available if versions differ
      return current !== latest;
    }
  }

  /**
   * Check for version updates
   */
  async checkForUpdates(): Promise<VersionInfo> {
    const current = this.getCurrentVersion();

    // Return cached result if recent
    if (!this.shouldCheck() && this.cachedVersionInfo) {
      return { ...this.cachedVersionInfo, current };
    }

    logger.debug(`Checking for updates. Current version: ${current}`);

    try {
      const latest = await this.fetchLatestVersion();
      
      const versionInfo: VersionInfo = {
        current,
        latest: latest || undefined,
        hasUpdate: latest ? this.compareVersions(current, latest) : false,
        lastChecked: new Date(),
        error: latest ? undefined : 'Could not fetch latest version'
      };

      this.cachedVersionInfo = versionInfo;
      
      if (versionInfo.hasUpdate) {
        logger.info(`New version available: ${latest} (current: ${current})`);
      } else {
        logger.debug('Application is up to date');
      }

      return versionInfo;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Version check failed:', errorMessage);
      
      const errorInfo: VersionInfo = {
        current,
        hasUpdate: false,
        lastChecked: new Date(),
        error: errorMessage
      };
      
      this.cachedVersionInfo = errorInfo;
      return errorInfo;
    }
  }

  /**
   * Get cached version info without making network requests
   */
  getCachedVersionInfo(): VersionInfo | null {
    return this.cachedVersionInfo;
  }
}

export const versionDetector = VersionDetector.getInstance();