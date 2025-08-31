/**
 * Centralized configuration management for Harbor Guard
 * All environment variables are defined and validated here
 */

export interface AppConfig {
  // Scanner Configuration
  maxConcurrentScans: number;
  scanTimeoutMinutes: number;
  enabledScanners: string[];
  
  // Logging
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  
  // Maintenance  
  cleanupOldScansDays: number;
  
  // Network
  port: number;
  bindAddress: string;
  
  // Notifications
  teamsWebhookUrl?: string;
  slackWebhookUrl?: string;
  gotifyServerUrl?: string;
  gotifyAppToken?: string;
  appriseApiUrl?: string;
  appriseConfigKey?: string;
  appriseUrls?: string;
  notifyOnHighSeverity: boolean;
  
  // Monitoring
  healthCheckEnabled: boolean;
  versionCheckEnabled: boolean;
  
  // Database (existing)
  databaseUrl: string;
}

/**
 * Parse and validate environment variables
 */
function parseEnvConfig(): AppConfig {
  return {
    // Scanner Configuration
    maxConcurrentScans: parseInt(process.env.MAX_CONCURRENT_SCANS || '3'),
    scanTimeoutMinutes: parseInt(process.env.SCAN_TIMEOUT_MINUTES || '30'),
    enabledScanners: (process.env.ENABLED_SCANNERS || 'trivy,grype,syft,dockle,osv,dive')
      .split(',')
      .map(s => s.trim()),
    
    // Logging
    logLevel: (process.env.LOG_LEVEL?.toLowerCase() as any) || 'info',
    
    // Maintenance
    cleanupOldScansDays: parseInt(process.env.CLEANUP_OLD_SCANS_DAYS || '30'),
    
    // Network
    port: parseInt(process.env.PORT || '3000'),
    bindAddress: process.env.BIND_ADDRESS || '0.0.0.0',
    
    // Notifications
    teamsWebhookUrl: process.env.TEAMS_WEBHOOK_URL,
    slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
    gotifyServerUrl: process.env.GOTIFY_SERVER_URL,
    gotifyAppToken: process.env.GOTIFY_APP_TOKEN,
    appriseApiUrl: process.env.APPRISE_API_URL,
    appriseConfigKey: process.env.APPRISE_CONFIG_KEY,
    appriseUrls: process.env.APPRISE_URLS,
    notifyOnHighSeverity: process.env.NOTIFY_ON_HIGH_SEVERITY?.toLowerCase() === 'true',
    
    // Monitoring
    healthCheckEnabled: process.env.HEALTH_CHECK_ENABLED?.toLowerCase() !== 'false',
    versionCheckEnabled: process.env.VERSION_CHECK_ENABLED?.toLowerCase() !== 'false',
    
    // Database
    databaseUrl: process.env.DATABASE_URL || 'file:./dev.db'
  };
}

/**
 * Validate configuration values
 */
function validateConfig(config: AppConfig): void {
  const errors: string[] = [];
  
  // Validate scanner settings
  if (config.maxConcurrentScans < 1 || config.maxConcurrentScans > 20) {
    errors.push('MAX_CONCURRENT_SCANS must be between 1 and 20');
  }
  
  if (config.scanTimeoutMinutes < 5 || config.scanTimeoutMinutes > 180) {
    errors.push('SCAN_TIMEOUT_MINUTES must be between 5 and 180');
  }
  
  // Validate log level
  if (!['debug', 'info', 'warn', 'error'].includes(config.logLevel)) {
    errors.push('LOG_LEVEL must be one of: debug, info, warn, error');
  }
  
  // Validate cleanup days
  if (config.cleanupOldScansDays < 1 || config.cleanupOldScansDays > 365) {
    errors.push('CLEANUP_OLD_SCANS_DAYS must be between 1 and 365');
  }
  
  // Validate port
  if (config.port < 1000 || config.port > 65535) {
    errors.push('PORT must be between 1000 and 65535');
  }
  
  // Validate enabled scanners
  const validScanners = ['trivy', 'grype', 'syft', 'dockle', 'osv', 'dive'];
  const invalidScanners = config.enabledScanners.filter(s => !validScanners.includes(s));
  if (invalidScanners.length > 0) {
    errors.push(`Invalid scanners: ${invalidScanners.join(', ')}. Valid options: ${validScanners.join(', ')}`);
  }
  
  if (config.enabledScanners.length === 0) {
    errors.push('At least one scanner must be enabled');
  }
  
  // Validate Gotify configuration
  if (config.gotifyServerUrl && !config.gotifyAppToken) {
    errors.push('GOTIFY_APP_TOKEN is required when GOTIFY_SERVER_URL is set');
  }
  
  if (config.gotifyAppToken && !config.gotifyServerUrl) {
    errors.push('GOTIFY_SERVER_URL is required when GOTIFY_APP_TOKEN is set');
  }
  
  if (config.gotifyServerUrl && !config.gotifyServerUrl.startsWith('http')) {
    errors.push('GOTIFY_SERVER_URL must start with http:// or https://');
  }
  
  // Validate Apprise configuration
  if (config.appriseUrls && !config.appriseApiUrl) {
    errors.push('APPRISE_API_URL is required when APPRISE_URLS is set');
  }
  
  if (config.appriseApiUrl && !config.appriseApiUrl.startsWith('http')) {
    errors.push('APPRISE_API_URL must start with http:// or https://');
  }
  
  if (errors.length > 0) {
    console.error('[CONFIG] Configuration validation errors:');
    errors.forEach(error => console.error(`[CONFIG] - ${error}`));
    throw new Error(`Configuration validation failed: ${errors.join(', ')}`);
  }
}

// Global singleton for configuration
declare global {
  var __harborguard_config: AppConfig | undefined;
}

/**
 * Get configuration singleton - lazy loaded and cached (except in development)
 */
function getConfig(): AppConfig {
  // In development, always re-read config to pick up env changes
  if (process.env.NODE_ENV !== 'development' && globalThis.__harborguard_config) {
    return globalThis.__harborguard_config;
  }

  try {
    const config = parseEnvConfig();
    validateConfig(config);
    
    // Cache the configuration globally
    globalThis.__harborguard_config = config;
    
    // Only log once during first load
    if (process.env.NODE_ENV !== 'test') {
      console.log('[CONFIG] Configuration loaded successfully');
      console.log('[CONFIG] Max concurrent scans:', config.maxConcurrentScans);
      console.log('[CONFIG] Scan timeout:', config.scanTimeoutMinutes, 'minutes');
      console.log('[CONFIG] Enabled scanners:', config.enabledScanners.join(', '));
      console.log('[CONFIG] Log level:', config.logLevel);
      console.log('[CONFIG] Port:', config.port);
      console.log('[CONFIG] Health checks:', config.healthCheckEnabled ? 'enabled' : 'disabled');
      
      if (config.teamsWebhookUrl || config.slackWebhookUrl) {
        console.log('[CONFIG] Notifications enabled');
      }
    }
    
    return config;
  } catch (error) {
    console.error('[CONFIG] Failed to load configuration:', error);
    process.exit(1);
  }
}

export const config = new Proxy({} as AppConfig, {
  get(target, prop) {
    const cfg = getConfig();
    return cfg[prop as keyof AppConfig];
  }
});