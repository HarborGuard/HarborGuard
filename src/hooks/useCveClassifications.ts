"use client"

import { useState, useEffect } from "react"
import { CveClassification } from "@/types"

export function useCveClassifications(imageId: string) {
  const [classifications, setClassifications] = useState<CveClassification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch all classifications for the image
  const fetchClassifications = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/images/${imageId}/cve-classifications`)
      if (!response.ok) {
        throw new Error("Failed to fetch CVE classifications")
      }
      const data = await response.json()
      setClassifications(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setLoading(false)
    }
  }

  // Save or update a classification
  const saveClassification = async (
    classification: Partial<CveClassification>
  ): Promise<void> => {
    const response = await fetch(`/api/images/${imageId}/cve-classifications`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(classification),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || "Failed to save classification")
    }

    // Refresh the classifications
    await fetchClassifications()
  }

  // Delete a classification
  const deleteClassification = async (cveId: string): Promise<void> => {
    const response = await fetch(
      `/api/images/${imageId}/cve-classifications/${encodeURIComponent(cveId)}`,
      {
        method: "DELETE",
      }
    )

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || "Failed to delete classification")
    }

    // Refresh the classifications
    await fetchClassifications()
  }

  // Get classification for a specific CVE
  const getClassification = (cveId: string): CveClassification | undefined => {
    return classifications.find((c) => c.cveId === cveId)
  }

  // Check if a CVE is marked as false positive
  const isFalsePositive = (cveId: string): boolean => {
    const classification = getClassification(cveId)
    return classification?.isFalsePositive ?? false
  }

  // Get comment for a CVE
  const getComment = (cveId: string): string | undefined => {
    const classification = getClassification(cveId)
    return classification?.comment || undefined
  }

  useEffect(() => {
    if (imageId && imageId.trim() !== "") {
      fetchClassifications()
    }
  }, [imageId])

  return {
    classifications,
    loading,
    error,
    saveClassification,
    deleteClassification,
    getClassification,
    isFalsePositive,
    getComment,
    refetch: fetchClassifications,
  }
}