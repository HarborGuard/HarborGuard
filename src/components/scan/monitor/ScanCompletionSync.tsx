"use client"

import { useScanCompletionSync } from '@/hooks/useScanCompletionSync';

/**
 * Component that sets up sync between scan completion and app state refresh
 * Should be rendered once at the app level
 */
export function ScanCompletionSync() {
  useScanCompletionSync();
  return null; // This component doesn't render anything
}