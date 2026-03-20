"use client"

import * as React from "react"
import { toast } from "sonner"
import { buildScanRequest, parseImageString as parseImage } from "@/lib/registry/registry-utils"
import { useApp } from "@/contexts/AppContext"
import { useScanning } from "@/contexts/ScanningContext"
import type { DockerImage, SwarmService } from "@/types"
import type { Repository, RepositoryImage } from "@/hooks/useScanSources"

export interface ScanFormState {
  selectedSource: string
  imageUrl: string
  githubRepo: string
  localImageName: string
  customRegistry: string
  selectedDockerImage: DockerImage | null
  selectedExistingImage: { source: string; name: string } | null
  selectedSwarmService: SwarmService | null
  scanAllLocalImages: boolean
  selectedRepository: Repository | null
  selectedImages: Record<string, RepositoryImage>
  selectedTags: Record<string, string>
  dockerImages: DockerImage[]
}

export interface ScanFormResetters {
  setSelectedSource: (value: string) => void
  setImageUrl: (value: string) => void
  setGithubRepo: (value: string) => void
  setLocalImageName: (value: string) => void
  setCustomRegistry: (value: string) => void
  setSelectedDockerImage: (value: DockerImage | null) => void
  setSelectedSwarmService: (value: SwarmService | null) => void
  setSearchQuery: (value: string) => void
  setScanAllLocalImages: (value: boolean) => void
  setLocalImageCount: (value: number) => void
  setIsOpen: (value: boolean) => void
}

export interface UseScanExecutionReturn {
  isLoading: boolean
  setIsLoading: (value: boolean) => void
  showProgress: boolean
  scanProgress: number
  handleStartScan: () => Promise<void>
  resetProgress: () => void
}

export function useScanExecution(
  formState: ScanFormState,
  resetters: ScanFormResetters
): UseScanExecutionReturn {
  const { refreshData } = useApp()
  const { addScanJob } = useScanning()

  const [isLoading, setIsLoading] = React.useState(false)
  const [scanProgress, setScanProgress] = React.useState(0)
  const [showProgress, setShowProgress] = React.useState(false)
  const progressIntervalRef = React.useRef<NodeJS.Timeout | null>(null)

  const startProgressAnimation = () => {
    setScanProgress(0)
    setShowProgress(true)
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current)
    }
    progressIntervalRef.current = setInterval(() => {
      setScanProgress(prev => (prev >= 80 ? 80 : prev + 1))
    }, 125)
  }

  const resetProgress = () => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current)
      progressIntervalRef.current = null
    }
    setScanProgress(0)
    setShowProgress(false)
  }

  React.useEffect(() => {
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current)
      }
    }
  }, [])

  const parseImageString = (imageString: string) => {
    const parsed = parseImage(imageString)
    return {
      imageName: parsed.imageName,
      imageTag: parsed.tag,
      registry: parsed.registry,
      registryType: parsed.registryType
    }
  }

  const getCurrentImageString = (): string => {
    const {
      selectedSource, imageUrl, githubRepo, selectedDockerImage,
      localImageName, customRegistry, selectedSwarmService,
      selectedRepository, selectedImages, selectedTags
    } = formState

    switch (selectedSource) {
      case 'dockerhub':
        return imageUrl
      case 'github':
        return githubRepo
      case 'local':
        return selectedDockerImage?.fullName || localImageName
      case 'custom':
        return customRegistry
      case 'existing':
        return imageUrl
      case 'swarm':
        return selectedSwarmService ? `${selectedSwarmService.image}:${selectedSwarmService.imageTag}` : ''
      case 'private':
        if (selectedRepository) {
          const image = selectedImages[selectedRepository.id]
          const tag = selectedTags[selectedRepository.id]
          return image && tag ? `${image.fullName || image.name}:${tag}` : ''
        }
        return ''
      default:
        return ''
    }
  }

  const handleStartScan = async () => {
    const {
      selectedSource, selectedDockerImage, selectedSwarmService,
      scanAllLocalImages, selectedRepository, selectedImages,
      selectedTags, selectedExistingImage, dockerImages
    } = formState

    // Handle scan all local images
    if (selectedSource === 'local' && scanAllLocalImages) {
      try {
        setIsLoading(true)
        startProgressAnimation()

        const response = await fetch('/api/scans/local-bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Failed to start bulk scan')
        }

        if (data.data.scanJobs && Array.isArray(data.data.scanJobs)) {
          data.data.scanJobs.forEach((job: any) => {
            addScanJob({
              requestId: job.requestId,
              scanId: job.scanId,
              imageId: job.imageId || '',
              imageName: job.imageName,
              status: 'RUNNING',
              progress: 0,
              step: 'Initializing...'
            })
          })
        }

        toast.success(`Started scanning ${data.data.totalImages} local images`)
        resetters.setIsOpen(false)
        resetters.setScanAllLocalImages(false)
        resetters.setLocalImageCount(0)
        await refreshData()
        resetProgress()
      } catch (error) {
        console.error('Failed to start bulk scan:', error)
        toast.error(error instanceof Error ? error.message : 'Failed to start bulk scan')
        resetProgress()
      } finally {
        setIsLoading(false)
      }
      return
    }

    const imageString = getCurrentImageString()

    if (!imageString) {
      toast.error("Please specify an image to scan")
      return
    }

    try {
      setIsLoading(true)
      startProgressAnimation()

      let imageName: string
      let imageTag: string
      let registry: string | undefined

      if (selectedSource === 'local' && selectedDockerImage) {
        imageName = selectedDockerImage.repository
        imageTag = selectedDockerImage.tag
        registry = 'local'
      } else if (selectedSource === 'swarm' && selectedSwarmService) {
        imageName = selectedSwarmService.image
        imageTag = selectedSwarmService.imageTag
        registry = undefined
      } else if (selectedSource === 'private' && selectedRepository) {
        const selectedImage = selectedImages[selectedRepository.id]
        const selectedTag = selectedTags[selectedRepository.id]
        if (selectedImage && selectedTag) {
          imageName = selectedImage.fullName || selectedImage.name
          imageTag = selectedTag
          registry = selectedRepository.registryUrl
        } else {
          toast.error("Please select an image and tag")
          setIsLoading(false)
          return
        }
      } else {
        const parsed = parseImageString(imageString)
        imageName = parsed.imageName
        imageTag = parsed.imageTag
        registry = parsed.registry
      }

      const scanRequest = buildScanRequest(imageString, selectedSource, {
        registry,
        image: imageName,
        tag: imageTag
      })

      if (selectedSource === 'local' && selectedDockerImage) {
        scanRequest.source = 'local'
        scanRequest.dockerImageId = selectedDockerImage.id
      }

      if (selectedSource === 'existing' && selectedExistingImage) {
        scanRequest.source = selectedExistingImage.source
        if (selectedExistingImage.source === 'local') {
          const localImage = dockerImages.find((img: any) => img.fullName === selectedExistingImage.name)
          if (localImage) {
            scanRequest.dockerImageId = localImage.id
          }
        }
      }

      if (selectedSource === 'private' && selectedRepository) {
        scanRequest.repositoryId = selectedRepository.id
        scanRequest.source = 'registry'
      }

      if (selectedSource === 'swarm' && selectedSwarmService) {
        scanRequest.source = 'registry'
      }

      const response = await fetch('/api/scans/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(scanRequest),
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(error || 'Failed to start scan')
      }

      const result = await response.json()

      addScanJob({
        requestId: result.requestId,
        scanId: result.scanId,
        imageId: '',
        status: 'RUNNING',
        progress: 0,
        step: 'Initializing scan'
      })

      toast.success(`Started scanning ${imageName}:${imageTag}`, {
        description: `Request ID: ${result.requestId}`,
      })

      resetProgress()

      // Reset form and close modal
      resetters.setSelectedSource('')
      resetters.setImageUrl('')
      resetters.setGithubRepo('')
      resetters.setLocalImageName('')
      resetters.setCustomRegistry('')
      resetters.setSelectedDockerImage(null)
      resetters.setSelectedSwarmService(null)
      resetters.setSearchQuery('')
      resetters.setIsOpen(false)

      setTimeout(() => {
        refreshData()
      }, 1000)

    } catch (error) {
      console.error('Failed to start scan:', error)
      toast.error("Scan Failed", {
        description: error instanceof Error ? error.message : "Failed to start scan",
      })
    } finally {
      setIsLoading(false)
      if (progressIntervalRef.current) {
        resetProgress()
      }
    }
  }

  return {
    isLoading,
    setIsLoading,
    showProgress,
    scanProgress,
    handleStartScan,
    resetProgress,
  }
}
