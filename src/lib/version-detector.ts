/**
 * Version detection utilities for Harbor Guard
 * Checks if a newer version is available from ghcr.io/harborguard/harborguard:latest
 */

import { logger } from './logger';
import { config } from './config';

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
    // Use NEXT_PUBLIC_APP_VERSION which is set from package.json in next.config.ts
    if (process.env.NEXT_PUBLIC_APP_VERSION) {
      return process.env.NEXT_PUBLIC_APP_VERSION;
    }

    // Development fallback - also read from package.json if available
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
   * Fetch latest version from GitHub releases (public API)
   */
  private async fetchLatestVersion(): Promise<string | null> {
    try {
      // First try GitHub Releases API (public, no auth required)
      const releasesUrl = `https://api.github.com/repos/harborguard/harborguard/releases/latest`;
      
      logger.debug(`Checking for latest version at: ${releasesUrl}`);
      
      const response = await fetch(releasesUrl, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Harbor-Guard-App'
        },
        // Add timeout to prevent hanging
        signal: AbortSignal.timeout(10000)
      });

      if (response.ok) {
        const release = await response.json();
        if (release && release.tag_name) {
          // Remove 'v' prefix if present
          return release.tag_name.replace(/^v/, '');
        }
      }

      // If no releases, return null (not an error case)
      if (response.status === 404) {
        logger.debug('No GitHub releases found, version checking disabled');
        return null;
      }

      // For other errors, try fallback
      return await this.fetchVersionFallback();
    } catch (error) {
      logger.debug('GitHub releases check failed:', error);
      return await this.fetchVersionFallback();
    }
  }

  /**
   * Fallback version checking method (disabled for now due to auth requirements)
   */
  private async fetchVersionFallback(): Promise<string | null> {
    // Docker registry requires authentication for private repos
    // For now, we'll skip this approach and return null
    logger.debug('Registry version checking requires authentication, skipping');
    return null;
  }

  /**
   * Compare version strings - simplified logic assuming online version is newer if different
   */
  private compareVersions(current: string, latest: string): boolean {
    // Handle development versions - always consider update available
    if (current.includes('dev')) return true;
    
    // If versions are exactly the same, no update needed
    if (current === latest) return false;
    
    // If versions differ, assume the online version is newer
    return true;
  }

  /**
   * Check for version updates
   */
  async checkForUpdates(): Promise<VersionInfo> {
    const current = this.getCurrentVersion();

    // Check if version checking is disabled
    if (!config.versionCheckEnabled) {
      const disabledInfo: VersionInfo = {
        current,
        hasUpdate: false,
        lastChecked: new Date(),
        error: 'Version checking disabled'
      };
      this.cachedVersionInfo = disabledInfo;
      return disabledInfo;
    }

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
        error: latest ? undefined : 'Version checking unavailable (no GitHub releases found)'
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