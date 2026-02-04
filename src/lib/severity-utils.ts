/**
 * Shared severity utility functions for consistent severity mapping
 * across the entire HarborGuard application.
 *
 * This module consolidates all severity color/badge/score mapping
 * that was previously scattered across 12+ files.
 */

export type SeverityLevel = 'critical' | 'high' | 'medium' | 'low' | 'info' | 'negligible';

/**
 * Normalize a raw severity string to a canonical SeverityLevel.
 * Handles case insensitivity and common abbreviations (e.g. "crit", "med").
 */
export function normalizeSeverity(raw: string): SeverityLevel {
  const lower = (raw || '').toLowerCase().trim();
  switch (lower) {
    case 'critical':
    case 'crit':
      return 'critical';
    case 'high':
      return 'high';
    case 'medium':
    case 'med':
      return 'medium';
    case 'low':
      return 'low';
    case 'info':
    case 'informational':
      return 'info';
    case 'negligible':
      return 'negligible';
    default:
      return 'info';
  }
}

/**
 * Returns badge variant for shadcn/ui Badge component.
 * critical -> destructive, high -> secondary, medium -> default, low/info/negligible -> outline
 */
export function getSeverityBadgeVariant(
  severity: string
): 'destructive' | 'secondary' | 'outline' | 'default' {
  const level = normalizeSeverity(severity);
  switch (level) {
    case 'critical':
      return 'destructive';
    case 'high':
      return 'secondary';
    case 'medium':
      return 'default';
    case 'low':
    case 'info':
    case 'negligible':
      return 'outline';
  }
}

/**
 * Returns Tailwind CSS background class for severity badges
 * (e.g. bg-red-500, bg-orange-500, etc.)
 */
export function getSeverityCssClass(severity: string): string {
  const level = normalizeSeverity(severity);
  switch (level) {
    case 'critical':
      return 'bg-red-500';
    case 'high':
      return 'bg-orange-500';
    case 'medium':
      return 'bg-yellow-500';
    case 'low':
      return 'bg-blue-500';
    case 'info':
    case 'negligible':
      return 'bg-gray-500';
  }
}

/**
 * Returns hex color string (without #) for reports and spreadsheet styling.
 */
export function getSeverityHexColor(severity: string): string {
  const level = normalizeSeverity(severity);
  switch (level) {
    case 'critical':
      return 'DC2626';   // Red
    case 'high':
      return 'EA580C';   // Orange
    case 'medium':
      return 'F59E0B';   // Amber/Yellow
    case 'low':
      return '3B82F6';   // Blue
    case 'info':
    case 'negligible':
      return '6B7280';   // Gray
  }
}

/**
 * Returns hex color string with # prefix for webhook/notification usage.
 */
export function getSeverityHashColor(severity: string): string {
  return '#' + getSeverityHexColor(severity);
}

/**
 * Returns numeric score for risk calculations.
 * critical=90, high=70, medium=50, low=30, info=10
 */
export function getSeverityScore(severity: string): number {
  const level = normalizeSeverity(severity);
  switch (level) {
    case 'critical':
      return 90;
    case 'high':
      return 70;
    case 'medium':
      return 50;
    case 'low':
      return 30;
    case 'info':
    case 'negligible':
      return 10;
  }
}

/**
 * Returns weight for sorting (critical=4, high=3, medium=2, low=1, info/negligible=0).
 */
export function getSeverityWeight(severity: string): number {
  const level = normalizeSeverity(severity);
  switch (level) {
    case 'critical':
      return 4;
    case 'high':
      return 3;
    case 'medium':
      return 2;
    case 'low':
      return 1;
    case 'info':
    case 'negligible':
      return 0;
  }
}
