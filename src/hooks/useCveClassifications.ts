"use client";

import { useState, useEffect, useCallback } from "react";

export function useCveClassifications(
  decodedImageName: string,
  scanData: any
) {
  const [consolidatedClassifications, setConsolidatedClassifications] =
    useState<any[]>([]);
  const [classificationsLoading, setClassificationsLoading] = useState(true);

  // Helper functions for classifications
  const getClassification = useCallback(
    (cveId: string) => {
      return consolidatedClassifications.find((c) => {
        // Check both direct cveId and nested structure
        const directCveId = c.cveId;
        const nestedCveId = c.imageVulnerability?.vulnerability?.cveId;
        return directCveId === cveId || nestedCveId === cveId;
      });
    },
    [consolidatedClassifications]
  );

  const isFalsePositive = useCallback(
    (cveId: string) => {
      const classification = getClassification(cveId);
      return classification?.isFalsePositive ?? false;
    },
    [getClassification]
  );

  const getComment = useCallback(
    (cveId: string) => {
      const classification = getClassification(cveId);
      return classification?.comment || undefined;
    },
    [getClassification]
  );

  const fetchConsolidatedClassifications = useCallback(async () => {
    if (!decodedImageName) return;

    try {
      setClassificationsLoading(true);

      // Try the new consolidated endpoint first
      const response = await fetch(
        `/api/images/name/${encodeURIComponent(
          decodedImageName
        )}/cve-classifications`
      );
      if (response.ok) {
        const consolidated = await response.json();
        console.log(
          `Loaded ${consolidated.length} consolidated CVE classifications for ${decodedImageName}`
        );
        setConsolidatedClassifications(consolidated);
        return;
      }

      // Fallback: just use the current image's classifications
      if (scanData?.image?.id) {
        const fallbackResponse = await fetch(
          `/api/images/${scanData.image.id}/cve-classifications`
        );
        if (fallbackResponse.ok) {
          const classifications = await fallbackResponse.json();
          console.log(
            `Fallback: Loaded ${classifications.length} CVE classifications for current image`
          );
          setConsolidatedClassifications(classifications);
        }
      }
    } catch (error) {
      console.error("Error fetching consolidated classifications:", error);
    } finally {
      setClassificationsLoading(false);
    }
  }, [decodedImageName, scanData?.image?.id]);

  const saveClassification = useCallback(
    async (classification: any) => {
      try {
        // Save to all tags of this image name using the new endpoint
        const response = await fetch(
          `/api/images/name/${encodeURIComponent(
            decodedImageName
          )}/cve-classifications`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(classification),
          }
        );

        if (!response.ok) {
          // Fallback: save to the specific image only
          const fallbackResponse = await fetch(
            `/api/images/${scanData?.image?.id}/cve-classifications`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(classification),
            }
          );

          if (!fallbackResponse.ok) {
            throw new Error("Failed to save classification");
          }
        }

        // Refresh classifications
        fetchConsolidatedClassifications();
      } catch (error) {
        console.error("Failed to save CVE classification:", error);
        throw error;
      }
    },
    [decodedImageName, scanData?.image?.id, fetchConsolidatedClassifications]
  );

  const deleteClassification = useCallback(
    async (cveId: string) => {
      // For deletion, we'll remove from the specific image to maintain existing functionality
      try {
        const response = await fetch(
          `/api/images/${
            scanData?.image?.id
          }/cve-classifications/${encodeURIComponent(cveId)}`,
          {
            method: "DELETE",
          }
        );

        if (!response.ok) {
          throw new Error("Failed to delete classification");
        }

        // Refresh classifications
        fetchConsolidatedClassifications();
      } catch (error) {
        console.error("Failed to delete CVE classification:", error);
        throw error;
      }
    },
    [scanData?.image?.id, fetchConsolidatedClassifications]
  );

  // Fetch consolidated classifications when scan data is available
  useEffect(() => {
    if (scanData && decodedImageName) {
      fetchConsolidatedClassifications();
    }
  }, [scanData, decodedImageName, fetchConsolidatedClassifications]);

  return {
    consolidatedClassifications,
    classificationsLoading,
    getClassification,
    isFalsePositive,
    getComment,
    saveClassification,
    deleteClassification,
    fetchConsolidatedClassifications,
  };
}
