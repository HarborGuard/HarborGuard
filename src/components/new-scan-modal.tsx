"use client"

import * as React from "react"
import {
  IconBrandDocker,
  IconBrandGithub,
  IconDeviceDesktop,
  IconLink,
  IconSearch,
  IconX,
} from "@tabler/icons-react"

import { Badge } from "components/components/ui/badge"
import { Button } from "components/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "components/components/ui/dialog"
import { Input } from "components/components/ui/input"
import { Label } from "components/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "components/components/ui/select"
import { Separator } from "components/components/ui/separator"
import { Progress } from "components/components/ui/progress"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "components/components/ui/tabs"
import { toast } from "sonner"
import { useApp } from "@/contexts/AppContext"
import { useScanning } from "@/providers/ScanningProvider"
import { DockerImageAutocomplete } from "@/components/DockerImageAutocomplete"
import { DockerImageSelector } from "@/components/docker-image-selector"
import { useDockerImages } from "@/hooks/useDockerImages"
import type { DockerImage, ScanSource } from "@/types"


interface NewScanModalProps {
  children: React.ReactNode
}


export function NewScanModal({ children }: NewScanModalProps) {
  const { state, refreshData } = useApp()
  const { addScanJob } = useScanning()
  const { dockerInfo, images: dockerImages } = useDockerImages()
  const [isLoading, setIsLoading] = React.useState(false)
  const [isOpen, setIsOpen] = React.useState(false)
  const [scanProgress, setScanProgress] = React.useState(0)
  const [showProgress, setShowProgress] = React.useState(false)
  const progressIntervalRef = React.useRef<NodeJS.Timeout | null>(null)

  // Function to start progress animation (0-80% in 10 seconds)
  const startProgressAnimation = () => {
    setScanProgress(0)
    setShowProgress(true)
    
    // Clear any existing interval
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current)
    }
    
    // Update progress every 125ms to reach 80% in 10 seconds (10000ms / 80 = 125ms)
    progressIntervalRef.current = setInterval(() => {
      setScanProgress(prev => {
        if (prev >= 80) {
          return 80
        }
        return prev + 1
      })
    }, 125)
  }

  // Function to reset/hide progress
  const resetProgress = () => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current)
      progressIntervalRef.current = null
    }
    setScanProgress(0)
    setShowProgress(false)
  }

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current)
      }
    }
  }, [])
  
  // Get real scanned images from app state
  const existingImages = React.useMemo(() => {
    return state.scans
      .filter(scan => scan.status === 'Complete')
      .map(scan => ({
        id: scan.id,
        name: scan.image,
        lastScan: scan.lastScan || '',
        riskScore: scan.riskScore,
        source: scan.source || 'registry'
      }))
      .sort((a, b) => new Date(b.lastScan).getTime() - new Date(a.lastScan).getTime()) // Sort by most recent
  }, [state.scans])
  
  const [searchQuery, setSearchQuery] = React.useState("")
  const [selectedSource, setSelectedSource] = React.useState<string>("dockerhub")
  const [imageUrl, setImageUrl] = React.useState("")
  const [githubRepo, setGithubRepo] = React.useState("")
  const [localImageName, setLocalImageName] = React.useState("")
  const [customRegistry, setCustomRegistry] = React.useState("")
  const [selectedDockerImage, setSelectedDockerImage] = React.useState<DockerImage | null>(null)
  const [selectedExistingImage, setSelectedExistingImage] = React.useState<{source: string, name: string} | null>(null)
  

  const filteredImages = existingImages.filter(image =>
    image.name.toLowerCase().includes(searchQuery.toLowerCase())
  )


  const parseImageString = (imageString: string): { imageName: string; imageTag: string; registry?: string } => {
    // Handle different image formats
    let fullImage = imageString.trim()
    
    // Extract registry, image name, and tag
    let registry: string | undefined
    let imageName: string
    let imageTag = 'latest'
    
    // Check if it has a registry (contains domain/port)
    if (fullImage.includes('/') && (fullImage.includes('.') || fullImage.includes(':'))) {
      const parts = fullImage.split('/')
      if (parts[0].includes('.') || parts[0].includes(':')) {
        registry = parts[0]
        fullImage = parts.slice(1).join('/')
      }
    }
    
    // Split image name and tag
    if (fullImage.includes(':')) {
      const lastColonIndex = fullImage.lastIndexOf(':')
      imageName = fullImage.substring(0, lastColonIndex)
      imageTag = fullImage.substring(lastColonIndex + 1)
    } else {
      imageName = fullImage
    }
    
    return { imageName, imageTag, registry }
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
      default:
        return ''
    }
  }

  const handleStartScan = async () => {
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

      // Handle local Docker images differently - use direct repository/tag values
      if (selectedSource === 'local' && selectedDockerImage) {
        imageName = selectedDockerImage.repository
        imageTag = selectedDockerImage.tag
        registry = 'local' // Set registry to 'local' for local images
      } else {
        // Parse image string for registry images
        const parsed = parseImageString(imageString)
        imageName = parsed.imageName
        imageTag = parsed.imageTag
        registry = parsed.registry
      }
      
      // Prepare scan request based on source type
      const scanRequest: any = {
        image: imageName,
        tag: imageTag,
        registry,
      }

      // For local Docker images, add source and Docker image ID
      if (selectedSource === 'local' && selectedDockerImage) {
        scanRequest.source = 'local'
        scanRequest.dockerImageId = selectedDockerImage.id
      }
      
      // For existing images, use their original source
      if (selectedSource === 'existing' && selectedExistingImage) {
        scanRequest.source = selectedExistingImage.source
        // If the existing image was local, we need to try to find it in Docker
        if (selectedExistingImage.source === 'local') {
          // Try to find the local Docker image by name
          const localImage = dockerImages.find((img: any) => img.fullName === selectedExistingImage.name)
          if (localImage) {
            scanRequest.dockerImageId = localImage.id
          }
        }
      }
      
      const response = await fetch('/api/scans/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(scanRequest),
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(error || 'Failed to start scan')
      }

      const result = await response.json()
      
      // Add scan job to the scanning provider
      addScanJob({
        requestId: result.requestId,
        scanId: result.scanId,
        imageId: '', // Will be updated when job data is fetched
        status: 'RUNNING',
        progress: 0,
        step: 'Initializing scan'
      })
      
      toast.success(`Started scanning ${imageName}:${imageTag}`, {
        description: `Request ID: ${result.requestId}`,
      })
      
      // Reset progress loader
      resetProgress()
      
      // Reset form and close modal
      setSelectedSource('')
      setImageUrl('')
      setGithubRepo('')
      setLocalImageName('')
      setCustomRegistry('')
      setSelectedDockerImage(null)
      setSearchQuery('')
      setIsOpen(false)
      
      // Refresh the scan list to show the new scan
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
      // Also reset progress on error
      if (progressIntervalRef.current) {
        resetProgress()
      }
    }
  }

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
          {/* Existing Images Section - only show if there are scanned images */}
          {existingImages.length > 0 && (
            <>
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold">Previously Scanned Images</h3>
                </div>
                
                <div className="relative">
                  <IconSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                  <Input
                    placeholder="Search existing images..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                
                <div className="max-h-48 overflow-y-auto space-y-2 border rounded-md p-2">
                  {filteredImages.length > 0 ? (
                    filteredImages.map((image) => (
                      <div
                        key={image.id}
                        className="flex items-center justify-between p-3 rounded-md border hover:bg-muted/50 cursor-pointer"
                        onClick={() => {
                          setSelectedSource("existing")
                          setImageUrl(image.name)
                          setSelectedExistingImage({ source: image.source, name: image.name })
                        }}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{image.name}</p>
                          <p className="text-xs text-muted-foreground">
                            Last scan: {new Date(image.lastScan).toLocaleDateString()}
                          </p>
                        </div>
                        <Badge variant={image.riskScore > 70 ? "destructive" : image.riskScore > 40 ? "secondary" : "default"}>
                          {image.riskScore}
                        </Badge>
                      </div>
                    ))
                  ) : (
                    <p className="text-center text-muted-foreground py-4">No matching images found</p>
                  )}
                </div>
              </div>

              <Separator />
            </>
          )}

          {/* New Image Source Selection */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Scan New Image</h3>
            
            <Tabs value={selectedSource} onValueChange={setSelectedSource}>
              <TabsList className={`grid w-full ${dockerInfo?.hasAccess ? 'grid-cols-4' : 'grid-cols-3'}`}>
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
                <TabsTrigger value="custom" className="flex items-center gap-1">
                  <IconLink className="h-4 w-4" />
                  <span className="hidden sm:inline">Custom</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="dockerhub" className="space-y-3">
                <Label htmlFor="dockerhub-image">Docker Hub Image</Label>
                <DockerImageAutocomplete
                  value={imageUrl}
                  onChange={setImageUrl}
                  placeholder="e.g., nginx:latest or library/ubuntu:20.04"
                />
                <p className="text-xs text-muted-foreground">
                  Start typing to search Docker Hub images. Official images don't need 'library/' prefix.
                </p>
              </TabsContent>

              <TabsContent value="github" className="space-y-3">
                <Label htmlFor="github-repo">GitHub Container Registry</Label>
                <Input
                  id="github-repo"
                  placeholder="e.g., ghcr.io/owner/repo:tag"
                  value={githubRepo}
                  onChange={(e) => setGithubRepo(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Enter the full GitHub Container Registry URL including tag.
                </p>
              </TabsContent>

              {dockerInfo?.hasAccess && (
                <TabsContent value="local" className="space-y-3">
                  <Label htmlFor="local-image">Local Docker Image</Label>
                  <DockerImageSelector
                    onImageSelect={setSelectedDockerImage}
                    disabled={isLoading}
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground">
                    Select a Docker image from your local Docker daemon.
                  </p>
                </TabsContent>
              )}

              <TabsContent value="custom" className="space-y-3">
                <Label htmlFor="custom-registry">Custom Registry URL</Label>
                <Input
                  id="custom-registry"
                  placeholder="e.g., registry.company.com/app:v1.0.0"
                  value={customRegistry}
                  onChange={(e) => setCustomRegistry(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Enter the full URL to your custom registry image.
                </p>
              </TabsContent>
            </Tabs>
          </div>

        </div>

        {/* Progress Bar - Show when scan is starting */}
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
          <Button 
            onClick={handleStartScan}
            disabled={
              isLoading || 
              !selectedSource || 
              (selectedSource === 'dockerhub' && !imageUrl) ||
              (selectedSource === 'github' && !githubRepo) ||
              (selectedSource === 'local' && !selectedDockerImage && !localImageName) ||
              (selectedSource === 'custom' && !customRegistry) ||
              (selectedSource === 'existing' && !imageUrl)
            }
          >
            {isLoading ? 'Starting Scan...' : 'Start Scan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}