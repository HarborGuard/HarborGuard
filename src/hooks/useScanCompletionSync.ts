import { useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useScanning } from '@/contexts/ScanningContext';

/**
 * Hook that syncs scan completion events with app state refresh
 * This should be used once at the app level to connect the two contexts
 */
export function useScanCompletionSync() {
  const { handleScanComplete } = useApp();
  const { setOnScanComplete } = useScanning();

  useEffect(() => {
    // Set up the callback to refresh app data when scans complete
    setOnScanComplete(handleScanComplete);

    // Cleanup: remove callback on unmount
    return () => {
      setOnScanComplete(() => {});
    };
  }, [handleScanComplete, setOnScanComplete]);
}