"use client"

import * as React from "react"
import {
  IconBrandDocker,
  IconBrandGithub,
  IconDeviceDesktop,
  IconLink,
  IconGitBranch,
  IconStack2,
} from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { toast } from "sonner"
import { buildScanRequest, parseImageString as parseImage } from "@/lib/registry/registry-utils"
import { useApp } from "@/contexts/AppContext"
import { useScanning } from "@/providers/ScanningProvider"
import { useDockerImages } from "@/hooks/useDockerImages"
import { useSwarmServices } from "@/hooks/useSwarmServices"
import { useScanSources } from "@/hooks/useScanSources"
import {
  DockerHubTab,
  GitHubTab,
  CustomRegistryTab,
  LocalImagesTab,
  SwarmServicesTab,
  PrivateRepositoriesTab,
  ExistingImagesSection,
} from "@/components/scan-sources"
import type { DockerImage, SwarmService } from "@/types"


interface NewScanModalProps {
  children: React.ReactNode
}


export function NewScanModal({ children }: NewScanModalProps) {
  const { state, refreshData } = useApp()
  const { addScanJob } = useScanning()
  const { dockerInfo, images: dockerImages } = useDockerImages()
  const { isSwarmMode } = useSwarmServices()
  const scanSources = useScanSources()

  const [selectedSwarmService, setSelectedSwarmService] = React.useState<SwarmService | null>(null)
  const [isLoading, setIsLoading] = React.useState(false)
  const [isOpen, setIsOpen] = React.useState(false)
  const [scanProgress, setScanProgress] = React.useState(0)
  const [showProgress, setShowProgress] = React.useState(false)
  const progressIntervalRef = React.useRef<NodeJS.Timeout | null>(null)

  const [searchQuery, setSearchQuery] = React.useState("")
  const [selectedSource, setSelectedSource] = React.useState<string>("dockerhub")
  const [imageUrl, setImageUrl] = React.useState("")
  const [githubRepo, setGithubRepo] = React.useState("")
  const [localImageName, setLocalImageName] = React.useState("")
  const [customRegistry, setCustomRegistry] = React.useState("")
  const [selectedDockerImage, setSelectedDockerImage] = React.useState<DockerImage | null>(null)
  const [selectedExistingImage, setSelectedExistingImage] = React.useState<{source: string, name: string} | null>(null)
  const [scanAllLocalImages, setScanAllLocalImages] = React.useState(false)

  // Progress animation helpers
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

  // Fetch repositories when modal opens
  React.useEffect(() => {
    if (isOpen) {
      scanSources.fetchRepositories()
    }
  }, [isOpen])

  // Fetch local image count when checkbox is checked
  React.useEffect(() => {
    if (scanAllLocalImages && dockerInfo?.hasAccess) {
      scanSources.fetchLocalImageCount()
    }
  }, [scanAllLocalImages, dockerInfo?.hasAccess])

  // Get real scanned images from app state
  const existingImages = React.useMemo(() => {
    const imageMap = new Map()
    state.scans
      .filter(scan => scan.status === 'Complete')
      .forEach(scan => {
        const imageName = typeof scan.image === 'string'
          ? scan.image
          : `${(scan.image as any)?.name}:${(scan.image as any)?.tag}`
        const existing = imageMap.get(imageName)
        if (!existing || new Date(scan.lastScan || '').getTime() > new Date(existing.lastScan).getTime()) {
          imageMap.set(imageName, {
            id: `${scan.id}_${imageName}_${scan.lastScan}`,
            name: imageName,
            lastScan: scan.lastScan || '',
            riskScore: scan.riskScore,
            source: scan.source || 'registry'
          })
        }
      })
    return Array.from(imageMap.values())
      .sort((a, b) => new Date(b.lastScan).getTime() - new Date(a.lastScan).getTime())
  }, [state.scans])

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
        if (scanSources.selectedRepository) {
          const image = scanSources.selectedImages[scanSources.selectedRepository.id]
          const tag = scanSources.selectedTags[scanSources.selectedRepository.id]
          return image && tag ? `${image.fullName || image.name}:${tag}` : ''
        }
        return ''
      default:
        return ''
    }
  }

  const handleStartScan = async () => {
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
        setIsOpen(false)
        setScanAllLocalImages(false)
        scanSources.setLocalImageCount(0)
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
      } else if (selectedSource === 'private' && scanSources.selectedRepository) {
        const selectedImage = scanSources.selectedImages[scanSources.selectedRepository.id]
        const selectedTag = scanSources.selectedTags[scanSources.selectedRepository.id]
        if (selectedImage && selectedTag) {
          imageName = selectedImage.fullName || selectedImage.name
          imageTag = selectedTag
          registry = scanSources.selectedRepository.registryUrl
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

      if (selectedSource === 'private' && scanSources.selectedRepository) {
        scanRequest.repositoryId = scanSources.selectedRepository.id
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

      setSelectedSource('')
      setImageUrl('')
      setGithubRepo('')
      setLocalImageName('')
      setCustomRegistry('')
      setSelectedDockerImage(null)
      setSelectedSwarmService(null)
      setSearchQuery('')
      setIsOpen(false)

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

  const isScanDisabled =
    isLoading ||
    !selectedSource ||
    (selectedSource === 'dockerhub' && !imageUrl) ||
    (selectedSource === 'github' && !githubRepo) ||
    (selectedSource === 'local' && !scanAllLocalImages && !selectedDockerImage && !localImageName) ||
    (selectedSource === 'custom' && !customRegistry) ||
    (selectedSource === 'existing' && !imageUrl) ||
    (selectedSource === 'swarm' && !selectedSwarmService) ||
    (selectedSource === 'private' && (!scanSources.selectedRepository || !scanSources.selectedImages[scanSources.selectedRepository?.id] || !scanSources.selectedTags[scanSources.selectedRepository?.id]))

  const scanButtonLabel = isLoading
    ? 'Starting Scan...'
    : (selectedSource === 'local' && scanAllLocalImages ? `Scan ${scanSources.localImageCount} Images` : 'Start Scan')

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[95vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>New Security Scan</DialogTitle>
          <DialogDescription>
            {existingImages.length > 0
              ? "Choose an image to scan or select from previously scanned images"
              : "Choose an image to scan for security vulnerabilities and misconfigurations"
            }
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-6 overflow-y-auto px-1 max-h-[75vh]">
          {/* Existing Images Section */}
          <ExistingImagesSection
            existingImages={existingImages}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            onSelectImage={(image) => {
              setSelectedSource("existing")
              setImageUrl(image.name)
              setSelectedExistingImage({ source: image.source, name: image.name })
            }}
          />

          {/* New Image Source Selection */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Scan New Image</h3>

            <Tabs value={selectedSource} onValueChange={setSelectedSource}>
              <TabsList className={`grid w-full ${dockerInfo?.hasAccess && isSwarmMode ? 'grid-cols-6' : dockerInfo?.hasAccess ? 'grid-cols-5' : 'grid-cols-4'}`}>
                <TabsTrigger value="dockerhub" className="flex items-center gap-1">
                  <IconBrandDocker className="h-4 w-4" />
                  <span className="hidden sm:inline">Docker Hub</span>
                </TabsTrigger>
                <TabsTrigger value="github" className="flex items-center gap-1">
                  <IconBrandGithub className="h-4 w-4" />
                  <span className="hidden sm:inline">GitHub</span>
                </TabsTrigger>
                {dockerInfo?.hasAccess && (
                  <TabsTrigger value="local" className="flex items-center gap-1">
                    <IconDeviceDesktop className="h-4 w-4" />
                    <span className="hidden sm:inline">Local</span>
                  </TabsTrigger>
                )}
                {dockerInfo?.hasAccess && isSwarmMode && (
                  <TabsTrigger value="swarm" className="flex items-center gap-1">
                    <IconStack2 className="h-4 w-4" />
                    <span className="hidden sm:inline">Swarm</span>
                  </TabsTrigger>
                )}
                <TabsTrigger value="custom" className="flex items-center gap-1">
                  <IconLink className="h-4 w-4" />
                  <span className="hidden sm:inline">Custom</span>
                </TabsTrigger>
                <TabsTrigger value="private" className="flex items-center gap-1">
                  <IconGitBranch className="h-4 w-4" />
                  <span className="hidden sm:inline">Private</span>
                </TabsTrigger>
              </TabsList>

              <DockerHubTab imageUrl={imageUrl} setImageUrl={setImageUrl} />
              <GitHubTab githubRepo={githubRepo} setGithubRepo={setGithubRepo} />

              {dockerInfo?.hasAccess && (
                <LocalImagesTab
                  scanAllLocalImages={scanAllLocalImages}
                  setScanAllLocalImages={setScanAllLocalImages}
                  localImageCount={scanSources.localImageCount}
                  setLocalImageCount={scanSources.setLocalImageCount}
                  selectedDockerImage={selectedDockerImage}
                  setSelectedDockerImage={setSelectedDockerImage}
                  isLoading={isLoading}
                />
              )}

              <CustomRegistryTab customRegistry={customRegistry} setCustomRegistry={setCustomRegistry} />

              {dockerInfo?.hasAccess && isSwarmMode && (
                <SwarmServicesTab
                  selectedSwarmService={selectedSwarmService}
                  setSelectedSwarmService={setSelectedSwarmService}
                  isLoading={isLoading}
                />
              )}

              <PrivateRepositoriesTab
                repositories={scanSources.repositories}
                repositoryImages={scanSources.repositoryImages}
                repositoryTags={scanSources.repositoryTags}
                loadingImages={scanSources.loadingImages}
                loadingTags={scanSources.loadingTags}
                selectedImages={scanSources.selectedImages}
                setSelectedImages={scanSources.setSelectedImages}
                selectedTags={scanSources.selectedTags}
                setSelectedTags={scanSources.setSelectedTags}
                setSelectedRepository={scanSources.setSelectedRepository}
                fetchRepositoryImages={scanSources.fetchRepositoryImages}
                fetchImageTags={scanSources.fetchImageTags}
                isLoading={isLoading}
                setIsLoading={setIsLoading}
                setIsOpen={setIsOpen}
              />
            </Tabs>
          </div>
        </div>

        {/* Progress Bar */}
        {showProgress && (
          <div className="px-6 py-4 border-t">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Starting scan...</span>
                <span>{scanProgress}%</span>
              </div>
              <Progress value={scanProgress} className="w-full" />
            </div>
          </div>
        )}

        <DialogFooter className="flex gap-2">
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button onClick={handleStartScan} disabled={isScanDisabled}>
            {scanButtonLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
