"use client";

import { useState, useEffect, useMemo } from "react";
import {
  GrypeReport,
  SyftReport,
  TrivyReport,
  DockleReport,
  OSVReport,
  DiveReport,
} from "@/types";

export function useScanData(scanId: string) {
  const [scanData, setScanData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRawOutput, setShowRawOutput] = useState(false);

  useEffect(() => {
    async function fetchScanData() {
      try {
        const response = await fetch(`/api/scans/${scanId}`);
        if (!response.ok) {
          if (response.status === 404) {
            setError("Scan not found");
          } else {
            setError("Failed to load scan data");
          }
          return;
        }
        const data = await response.json();
        setScanData(data);
      } catch (err) {
        setError("Failed to load scan data");
        console.error("Error fetching scan data:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchScanData();
  }, [scanId]);

  // Check if raw output should be shown
  useEffect(() => {
    fetch("/api/config/raw-output")
      .then((res) => res.json())
      .then((data) => setShowRawOutput(data.enabled))
      .catch(() => setShowRawOutput(false));
  }, []);

  // Read from the normalized scannerData key provided by the API.
  // The server handles relational-table-to-report transformation and
  // JSONB fallback, so the client no longer needs a triple fallback chain.
  const trivyResults: TrivyReport | null = useMemo(
    () => scanData?.scannerData?.trivy ?? null,
    [scanData]
  );

  const grypeResults: GrypeReport | null = useMemo(
    () => scanData?.scannerData?.grype ?? null,
    [scanData]
  );

  const syftResults: SyftReport | null = useMemo(
    () => scanData?.scannerData?.syft ?? null,
    [scanData]
  );

  const dockleResults: DockleReport | null = useMemo(
    () => scanData?.scannerData?.dockle ?? null,
    [scanData]
  );

  const osvResults: OSVReport | null = useMemo(
    () => scanData?.scannerData?.osv ?? null,
    [scanData]
  );

  const diveResults: DiveReport | null = useMemo(
    () => scanData?.scannerData?.dive ?? null,
    [scanData]
  );

  return {
    scanData,
    loading,
    error,
    showRawOutput,
    trivyResults,
    grypeResults,
    syftResults,
    dockleResults,
    osvResults,
    diveResults,
  };
}
