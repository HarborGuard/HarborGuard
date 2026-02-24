'use client'

import { useState, useEffect } from 'react'
import type { DockerImage, DockerInfo } from '@/types'

interface UseDockerImagesReturn {
  images: DockerImage[]
  dockerInfo: DockerInfo | null
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function useDockerImages(): UseDockerImagesReturn {
  const [images, setImages] = useState<DockerImage[]>([])
  const [dockerInfo, setDockerInfo] = useState<DockerInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchDockerInfo = async (): Promise<DockerInfo> => {
    const response = await fetch('/api/docker/info')
    if (!response.ok) {
      throw new Error('Failed to check Docker access')
    }
    return response.json()
  }

  const fetchDockerImages = async (): Promise<DockerImage[]> => {
    const response = await fetch('/api/docker/images')
    if (!response.ok) {
      throw new Error('Failed to fetch Docker images')
    }
    const { data } = await response.json()
    return data
  }

  const refetch = async () => {
    setLoading(true)
    setError(null)
    
    try {
      // First check if Docker is accessible
      const info = await fetchDockerInfo()
      setDockerInfo(info)
      
      if (info.hasAccess) {
        // If Docker is accessible, fetch images
        const imageData = await fetchDockerImages()
        setImages(imageData)
      } else {
        setImages([])
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load Docker data'
      setError(errorMessage)
      setDockerInfo({ hasAccess: false, error: errorMessage })
      setImages([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refetch()
  }, [])

  return {
    images,
    dockerInfo,
    loading,
    error,
    refetch
  }
}