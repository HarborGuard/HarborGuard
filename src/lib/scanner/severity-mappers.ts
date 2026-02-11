/**
 * Severity mapping utility functions for normalizing severity levels
 * across different vulnerability scanners (Trivy, Grype, OSV, Dockle).
 */

/**
 * Map a generic severity string to a normalized severity level.
 * Used for Trivy and Grype severity values.
 */
export function mapSeverity(severity: string | undefined): string {
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

/**
 * Map OSV severity array (CVSS_V3 scores) to a normalized severity level.
 */
export function mapOsvSeverity(severities: any[] | undefined): string {
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

/**
 * Extract a numeric CVSS score from an OSV severity array.
 */
export function extractOsvScore(severities: any[] | undefined): number | null {
  if (!severities || severities.length === 0) return null;

  for (const sev of severities) {
    if (sev.type === 'CVSS_V3' && sev.score) {
      return parseFloat(sev.score);
    }
  }

  return null;
}

/**
 * Map a Dockle alert level to a compliance category.
 */
export function mapDockleCategory(level: string): string {
  switch (level) {
    case 'FATAL': return 'Security';
    case 'WARN': return 'BestPractice';
    case 'INFO': return 'CIS';
    default: return 'BestPractice';
  }
}

/**
 * Map a Dockle alert level to a normalized severity level.
 */
export function mapDockleSeverity(level: string): string {
  switch (level) {
    case 'FATAL': return 'CRITICAL';
    case 'WARN': return 'MEDIUM';
    case 'INFO': return 'LOW';
    default: return 'INFO';
  }
}

/**
 * Given a list of severity strings, return the highest (most critical) one.
 */
export function getHighestSeverity(severities: string[]): string {
  const order = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];
  for (const level of order) {
    if (severities.includes(level)) {
      return level;
    }
  }
  return 'INFO';
}
