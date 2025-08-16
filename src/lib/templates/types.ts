export interface ScanTemplate {
  id: string;
  name: string;
  description?: string;
  environment: 'production' | 'staging' | 'development' | 'any';
  scannerConfig: ScannerConfig;
  policyConfig?: PolicyConfig;
  notificationConfig?: NotificationConfig;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
}

export interface ScannerConfig {
  scanners: string[];           // Which scanners to run: ['trivy', 'grype', 'syft', 'osv', 'dockle', 'dive']
  failOnHigh?: boolean;         // Stop on high-severity findings
  timeout?: number;             // Custom timeout in milliseconds
  cacheEnabled?: boolean;       // Use cached results
  parallelScans?: boolean;      // Run scanners in parallel
  customArgs?: Record<string, string[]>; // Custom arguments per scanner
}

export interface PolicyConfig {
  maxCritical: number;          // Max allowed critical vulnerabilities
  maxHigh: number;              // Max allowed high vulnerabilities
  maxMedium?: number;           // Max allowed medium vulnerabilities
  complianceRequired: boolean;  // Require compliance checks to pass
  generateReport?: boolean;     // Auto-generate compliance report
  allowedLicenses?: string[];   // Allowed software licenses
  blockedPackages?: string[];   // Blocked package patterns
}

export interface NotificationConfig {
  channels: ('slack' | 'email' | 'webhook')[];
  recipients: string[];         // Email addresses, Slack channels, webhook URLs
  onFailure: boolean;           // Notify on scan failure
  onThresholdExceeded: boolean; // Notify when policy thresholds exceeded
  onCompletion?: boolean;       // Notify on successful completion
  customMessage?: string;       // Custom notification message template
}

export interface CreateTemplateRequest {
  name: string;
  description?: string;
  environment: ScanTemplate['environment'];
  scannerConfig: ScannerConfig;
  policyConfig?: PolicyConfig;
  notificationConfig?: NotificationConfig;
  isDefault?: boolean;
  createdBy?: string;
}

export interface AppliedScanRequest {
  image: string;
  tag: string;
  registry?: string;
  source?: string;
  dockerImageId?: string;
  template?: ScanTemplate;
  scannerConfig?: ScannerConfig;
  policyConfig?: PolicyConfig;
  notificationConfig?: NotificationConfig;
}