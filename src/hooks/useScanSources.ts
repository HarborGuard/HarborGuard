"use client"

import * as React from "react"
import { toast } from "sonner"

export interface Repository {
  id: string
  name: string
  type: string
  registryUrl: string
  protocol?: string
  status: string
}

export interface RepositoryImage {
  name: string
  fullName?: string
  namespace?: string
}

export interface RepositoryTag {
  name: string
}

export interface UseScanSourcesReturn {
  repositories: Repository[]
  repositoryImages: Record<string, RepositoryImage[]>
  repositoryTags: Record<string, RepositoryTag[]>
  loadingImages: Record<string, boolean>
  loadingTags: Record<string, boolean>
  selectedRepository: Repository | null
  setSelectedRepository: React.Dispatch<React.SetStateAction<Repository | null>>
  selectedImages: Record<string, RepositoryImage>
  setSelectedImages: React.Dispatch<React.SetStateAction<Record<string, RepositoryImage>>>
  selectedTags: Record<string, string>
  setSelectedTags: React.Dispatch<React.SetStateAction<Record<string, string>>>
  scanAllRepoImages: Record<string, boolean>
  setScanAllRepoImages: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  localImageCount: number
  setLocalImageCount: React.Dispatch<React.SetStateAction<number>>
  fetchRepositories: () => Promise<void>
  fetchRepositoryImages: (repository: Repository, forceRefresh?: boolean) => Promise<void>
  fetchImageTags: (repository: Repository, image: RepositoryImage) => Promise<void>
  fetchLocalImageCount: () => Promise<void>
}

export function useScanSources(): UseScanSourcesReturn {
  const [repositories, setRepositories] = React.useState<Repository[]>([])
  const [repositoryImages, setRepositoryImages] = React.useState<Record<string, RepositoryImage[]>>({})
  const [repositoryTags, setRepositoryTags] = React.useState<Record<string, RepositoryTag[]>>({})
  const [loadingImages, setLoadingImages] = React.useState<Record<string, boolean>>({})
  const [loadingTags, setLoadingTags] = React.useState<Record<string, boolean>>({})
  const [selectedRepository, setSelectedRepository] = React.useState<Repository | null>(null)
  const [selectedImages, setSelectedImages] = React.useState<Record<string, RepositoryImage>>({})
  const [selectedTags, setSelectedTags] = React.useState<Record<string, string>>({})
  const [scanAllRepoImages, setScanAllRepoImages] = React.useState<Record<string, boolean>>({})
  const [localImageCount, setLocalImageCount] = React.useState(0)

  const fetchLocalImageCount = async () => {
    try {
      const response = await fetch('/api/docker/images')
      if (response.ok) {
        const { data: images } = await response.json()
        setLocalImageCount(images.length)
      }
    } catch (error) {
      console.error('Failed to fetch local image count:', error)
      setLocalImageCount(0)
    }
  }

  const fetchRepositories = async () => {
    try {
      const response = await fetch('/api/repositories')
      if (response.ok) {
        const { data } = await response.json()
        setRepositories(data.filter((repo: any) => repo.status === 'ACTIVE'))
      }
    } catch (error) {
      console.error('Failed to fetch repositories:', error)
    }
  }

  const fetchRepositoryImages = async (repository: Repository, forceRefresh: boolean = false) => {
    setLoadingImages(prev => ({ ...prev, [repository.id]: true }))

    try {
      const url = forceRefresh
        ? `/api/repositories/${repository.id}/images?t=${Date.now()}`
        : `/api/repositories/${repository.id}/images`

      const response = await fetch(url, {
        cache: forceRefresh ? 'no-cache' : 'default'
      })

      if (response.ok) {
        const data = await response.json()
        setRepositoryImages(prev => ({ ...prev, [repository.id]: data }))
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        console.error('Failed to fetch repository images - server error:', response.status, errorData)
        toast.error(`Failed to fetch repository images: ${errorData.error || 'Server error'}`)
        setRepositoryImages(prev => ({ ...prev, [repository.id]: [] }))
      }
    } catch (error) {
      console.error('Failed to fetch repository images:', error)
      toast.error('Failed to fetch repository images')
      setRepositoryImages(prev => ({ ...prev, [repository.id]: [] }))
    } finally {
      setLoadingImages(prev => ({ ...prev, [repository.id]: false }))
    }
  }

  const fetchImageTags = async (repository: Repository, image: RepositoryImage) => {
    setLoadingTags(prev => ({ ...prev, [repository.id]: true }))

    try {
      const url = new URL(`/api/repositories/${repository.id}/images/${encodeURIComponent(image.name)}/tags`, window.location.origin)
      if (image.namespace) {
        url.searchParams.append('namespace', image.namespace)
      }

      const response = await fetch(url.toString())
      if (response.ok) {
        const data = await response.json()
        setRepositoryTags(prev => ({ ...prev, [repository.id]: data }))
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        toast.error(`Failed to fetch image tags: ${errorData.error || 'Server error'}`)
        setRepositoryTags(prev => ({ ...prev, [repository.id]: [] }))
      }
    } catch (error) {
      toast.error('Failed to fetch image tags')
      setRepositoryTags(prev => ({ ...prev, [repository.id]: [] }))
    } finally {
      setLoadingTags(prev => ({ ...prev, [repository.id]: false }))
    }
  }

  return {
    repositories,
    repositoryImages,
    repositoryTags,
    loadingImages,
    loadingTags,
    selectedRepository,
    setSelectedRepository,
    selectedImages,
    setSelectedImages,
    selectedTags,
    setSelectedTags,
    scanAllRepoImages,
    setScanAllRepoImages,
    localImageCount,
    setLocalImageCount,
    fetchRepositories,
    fetchRepositoryImages,
    fetchImageTags,
    fetchLocalImageCount,
  }
}
