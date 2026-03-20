"use client";

import { useState, useEffect, useCallback } from "react";

/**
 * Shared hook for accessing CVE classifications.
 *
 * Always tries the consolidated endpoint first:
 *   /api/images/name/{imageName}/cve-classifications
 *
 * Falls back to per-imageId if the consolidated endpoint returns 404:
 *   /api/images/{imageId}/cve-classifications
 *
 * @param imageName  - The decoded image name (e.g. "library/nginx")
 * @param scanDataOrImageId - Either scan data object with image.id, or a direct imageId string for fallback
 */
export function useCveClassifications(
  imageName: string,
  scanDataOrImageId?: any | string
) {
  const [consolidatedClassifications, setConsolidatedClassifications] =
    useState<any[]>([]);
  const [classificationsLoading, setClassificationsLoading] = useState(true);

  // Resolve the fallback imageId from either a scanData object or a direct string
  const fallbackImageId =
    typeof scanDataOrImageId === "string"
      ? scanDataOrImageId
      : scanDataOrImageId?.image?.id || undefined;

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
    if (!imageName) return;

    try {
      setClassificationsLoading(true);

      // Always try the consolidated endpoint first
      const response = await fetch(
        `/api/images/name/${encodeURIComponent(
          imageName
        )}/cve-classifications`
      );
      if (response.ok) {
        const consolidated = await response.json();
        console.log(
          `Loaded ${consolidated.length} consolidated CVE classifications for ${imageName}`
        );
        setConsolidatedClassifications(consolidated);
        return;
      }

      // Only fall back to per-imageId if the consolidated endpoint returned 404
      if (response.status === 404 && fallbackImageId) {
        const fallbackResponse = await fetch(
          `/api/images/${fallbackImageId}/cve-classifications`
        );
        if (fallbackResponse.ok) {
          const classifications = await fallbackResponse.json();
          console.log(
            `Fallback: Loaded ${classifications.length} CVE classifications for image ${fallbackImageId}`
          );
          setConsolidatedClassifications(classifications);
        }
      }
    } catch (error) {
      console.error("Error fetching consolidated classifications:", error);
    } finally {
      setClassificationsLoading(false);
    }
  }, [imageName, fallbackImageId]);

  const saveClassification = useCallback(
    async (classification: any) => {
      try {
        // Save to all tags of this image name using the consolidated endpoint
        const response = await fetch(
          `/api/images/name/${encodeURIComponent(
            imageName
          )}/cve-classifications`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(classification),
          }
        );

        if (!response.ok && fallbackImageId) {
          // Fallback: save to the specific image only
          const fallbackResponse = await fetch(
            `/api/images/${fallbackImageId}/cve-classifications`,
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
    [imageName, fallbackImageId, fetchConsolidatedClassifications]
  );

  const deleteClassification = useCallback(
    async (cveId: string) => {
      if (!fallbackImageId) {
        console.error("Cannot delete classification: no imageId available");
        return;
      }
      try {
        const response = await fetch(
          `/api/images/${fallbackImageId}/cve-classifications/${encodeURIComponent(cveId)}`,
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
    [fallbackImageId, fetchConsolidatedClassifications]
  );

  // Fetch consolidated classifications when image name is available
  useEffect(() => {
    if (imageName) {
      fetchConsolidatedClassifications();
    }
  }, [imageName, fetchConsolidatedClassifications]);

  return {
    consolidatedClassifications,
    classificationsLoading,
    // Legacy alias for backward compatibility
    classifications: consolidatedClassifications,
    loading: classificationsLoading,
    getClassification,
    isFalsePositive,
    getComment,
    saveClassification,
    deleteClassification,
    fetchConsolidatedClassifications,
  };
}
