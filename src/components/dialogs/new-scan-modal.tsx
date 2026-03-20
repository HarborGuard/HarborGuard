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
import { useApp } from "@/contexts/AppContext"
import { useDockerImages } from "@/hooks/useDockerImages"
import { useSwarmServices } from "@/hooks/useSwarmServices"
import { useScanSources } from "@/hooks/useScanSources"
import { useScanExecution } from "@/hooks/useScanExecution"
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
  const { state } = useApp()
  const { dockerInfo, images: dockerImages } = useDockerImages()
  const { isSwarmMode } = useSwarmServices()
  const scanSources = useScanSources()

  const [isOpen, setIsOpen] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [selectedSource, setSelectedSource] = React.useState<string>("dockerhub")
  const [imageUrl, setImageUrl] = React.useState("")
  const [githubRepo, setGithubRepo] = React.useState("")
  const [localImageName, setLocalImageName] = React.useState("")
  const [customRegistry, setCustomRegistry] = React.useState("")
  const [selectedDockerImage, setSelectedDockerImage] = React.useState<DockerImage | null>(null)
  const [selectedExistingImage, setSelectedExistingImage] = React.useState<{source: string, name: string} | null>(null)
  const [selectedSwarmService, setSelectedSwarmService] = React.useState<SwarmService | null>(null)
  const [scanAllLocalImages, setScanAllLocalImages] = React.useState(false)

  const { isLoading, setIsLoading, showProgress, scanProgress, handleStartScan } = useScanExecution(
    {
      selectedSource,
      imageUrl,
      githubRepo,
      localImageName,
      customRegistry,
      selectedDockerImage,
      selectedExistingImage,
      selectedSwarmService,
      scanAllLocalImages,
      selectedRepository: scanSources.selectedRepository,
      selectedImages: scanSources.selectedImages,
      selectedTags: scanSources.selectedTags,
      dockerImages,
    },
    {
      setSelectedSource,
      setImageUrl,
      setGithubRepo,
      setLocalImageName,
      setCustomRegistry,
      setSelectedDockerImage,
      setSelectedSwarmService,
      setSearchQuery,
      setScanAllLocalImages,
      setLocalImageCount: scanSources.setLocalImageCount,
      setIsOpen,
    }
  )

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

  // Derive existing images from app state
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
