/**
 * Format a date for display. Returns localized date/time string.
 */
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return 'N/A';
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return 'N/A';
    return d.toLocaleString();
  } catch {
    return 'N/A';
  }
}

/**
 * Format a value for display, handling null/undefined/objects.
 */
export function renderValue(value: any, defaultValue = 'N/A'): string {
  if (value === null || value === undefined || value === '') return defaultValue;
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

/**
 * Format a license object/string for display.
 */
export function formatLicense(license: any): string {
  if (!license) return 'Unknown';
  if (typeof license === 'string') return license;
  if (license.name) return license.name;
  if (license.value) return license.value;
  if (license.license) return formatLicense(license.license);
  if (license.expression) return license.expression;
  if (Array.isArray(license)) return license.map(formatLicense).join(', ');
  return JSON.stringify(license);
}

/**
 * Format a duration in milliseconds to a human-readable string.
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

/**
 * Format duration between two dates.
 */
export function formatDurationBetween(start: Date | string, end: Date | string): string {
  const s = typeof start === 'string' ? new Date(start) : start;
  const e = typeof end === 'string' ? new Date(end) : end;
  return formatDuration(e.getTime() - s.getTime());
}
