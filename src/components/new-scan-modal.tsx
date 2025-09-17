"use client"

import * as React from "react"
import {
  IconBrandDocker,
  IconBrandGithub,
  IconDeviceDesktop,
  IconLink,
  IconSearch,
  IconX,
  IconGitBranch,
  IconServer,
} from "@tabler/icons-react"

import { Badge } from "components/components/ui/badge"
import { Button } from "components/components/ui/button"
import { Checkbox } from "components/components/ui/checkbox"
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
import { buildScanRequest, parseImageString as parseImage } from "@/lib/registry/registry-utils"
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

  const fetchLocalImageCount = async () => {
    try {
      const response = await fetch('/api/docker/images')
      if (response.ok) {
        const images = await response.json()
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
        const data = await response.json()
        setRepositories(data.filter((repo: any) => repo.status === 'ACTIVE'))
      }
    } catch (error) {
      console.error('Failed to fetch repositories:', error)
    }
  }

  const fetchRepositoryImages = async (repository: any) => {
    setLoadingImages(prev => ({ ...prev, [repository.id]: true }))

    try {
      const response = await fetch(`/api/repositories/${repository.id}/images`)
      if (response.ok) {
        const data = await response.json()
        setRepositoryImages(prev => ({ ...prev, [repository.id]: data }))
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        console.error('Failed to fetch repository images - server error:', response.status, errorData)
        toast.error(`Failed to fetch repository images: ${errorData.error || 'Server error'}`)
        // Set empty array so UI shows "No images found" instead of staying in loading state
        setRepositoryImages(prev => ({ ...prev, [repository.id]: [] }))
      }
    } catch (error) {
      console.error('Failed to fetch repository images:', error)
      toast.error('Failed to fetch repository images')
      // Set empty array so UI shows "No images found" instead of staying in loading state
      setRepositoryImages(prev => ({ ...prev, [repository.id]: [] }))
    } finally {
      setLoadingImages(prev => ({ ...prev, [repository.id]: false }))
    }
  }

  const fetchImageTags = async (repository: any, image: any) => {
    setLoadingTags(prev => ({ ...prev, [repository.id]: true }))
    
    try {
      // Build the URL with namespace if it exists
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
        // Set empty array so UI shows "No tags found" instead of staying in loading state
        setRepositoryTags(prev => ({ ...prev, [repository.id]: [] }))
      }
    } catch (error) {
      toast.error('Failed to fetch image tags')
      // Set empty array so UI shows "No tags found" instead of staying in loading state
      setRepositoryTags(prev => ({ ...prev, [repository.id]: [] }))
    } finally {
      setLoadingTags(prev => ({ ...prev, [repository.id]: false }))
    }
  }
  
  // Get real scanned images from app state
  const existingImages = React.useMemo(() => {
    // Use a Map to deduplicate by image name, keeping the most recent scan
    const imageMap = new Map()
    
    state.scans
      .filter(scan => scan.status === 'Complete')
      .forEach(scan => {
        // Handle both string and object formats for scan.image
        const imageName = typeof scan.image === 'string' 
          ? scan.image 
          : `${(scan.image as any)?.name}:${(scan.image as any)?.tag}`;
        const key = imageName;
        const existing = imageMap.get(key)
        
        if (!existing || new Date(scan.lastScan || '').getTime() > new Date(existing.lastScan).getTime()) {
          imageMap.set(key, {
            id: `${scan.id}_${imageName}_${scan.lastScan}`, // Create unique composite key
            name: imageName,
            lastScan: scan.lastScan || '',
            riskScore: scan.riskScore,
            source: scan.source || 'registry'
          })
        }
      })
    
    return Array.from(imageMap.values())
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
  const [repositories, setRepositories] = React.useState<any[]>([])
  const [selectedRepository, setSelectedRepository] = React.useState<any>(null)
  const [repositoryImages, setRepositoryImages] = React.useState<Record<string, any[]>>({})
  const [loadingImages, setLoadingImages] = React.useState<Record<string, boolean>>({})
  const [selectedImages, setSelectedImages] = React.useState<Record<string, any>>({})
  const [repositoryTags, setRepositoryTags] = React.useState<Record<string, any[]>>({})
  const [selectedTags, setSelectedTags] = React.useState<Record<string, string>>({})
  const [loadingTags, setLoadingTags] = React.useState<Record<string, boolean>>({})
  const [scanAllLocalImages, setScanAllLocalImages] = React.useState(false)
  const [localImageCount, setLocalImageCount] = React.useState(0)
  const [scanAllRepoImages, setScanAllRepoImages] = React.useState<Record<string, boolean>>({})
  
  // Fetch repositories when modal opens
  React.useEffect(() => {
    if (isOpen) {
      fetchRepositories()
    }
  }, [isOpen])

  // Fetch local image count when checkbox is checked
  React.useEffect(() => {
    if (scanAllLocalImages && dockerInfo?.hasAccess) {
      fetchLocalImageCount()
    }
  }, [scanAllLocalImages, dockerInfo?.hasAccess])

  const filteredImages = existingImages.filter(image => {
    // Handle both string and object formats
    const imageName = typeof image === 'string' ? image : (image?.name || '');
    return imageName.toLowerCase().includes(searchQuery.toLowerCase());
  })


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

        toast.success(`Started scanning ${data.data.totalImages} local images`)
        setIsOpen(false)
        
        // Reset states
        setScanAllLocalImages(false)
        setLocalImageCount(0)
        
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

      // Handle local Docker images differently - use direct repository/tag values
      if (selectedSource === 'local' && selectedDockerImage) {
        imageName = selectedDockerImage.repository
        imageTag = selectedDockerImage.tag
        registry = 'local' // Set registry to 'local' for local images
      } else if (selectedSource === 'private' && selectedRepository) {
        // Handle private repository images specially to preserve namespace
        const selectedImage = selectedImages[selectedRepository.id]
        const selectedTag = selectedTags[selectedRepository.id]
        if (selectedImage && selectedTag) {
          // For GitLab and other registries with namespaces, use fullName to preserve the namespace
          // fullName contains the complete path with namespace (e.g., "root/docker-image")
          imageName = selectedImage.fullName || selectedImage.name
          imageTag = selectedTag
          registry = selectedRepository.registryUrl
        } else {
          toast.error("Please select an image and tag")
          setIsLoading(false)
          return
        }
      } else {
        // Parse image string for registry images
        const parsed = parseImageString(imageString)
        imageName = parsed.imageName
        imageTag = parsed.imageTag
        registry = parsed.registry
      }
      
      // Build scan request using utility function
      const scanRequest = buildScanRequest(imageString, selectedSource, {
        registry,
        image: imageName,
        tag: imageTag
      })

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

      // For private repositories, ensure repository ID is set
      if (selectedSource === 'private' && selectedRepository) {
        scanRequest.repositoryId = selectedRepository.id
        scanRequest.source = 'registry'
        // Note: image name and tag are already set correctly above with namespace preserved
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
              <TabsList className={`grid w-full ${dockerInfo?.hasAccess ? 'grid-cols-5' : 'grid-cols-4'}`}>
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
                <TabsTrigger value="private" className="flex items-center gap-1">
                  <IconGitBranch className="h-4 w-4" />
                  <span className="hidden sm:inline">Private</span>
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
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="scan-all-local"
                      checked={scanAllLocalImages}
                      onCheckedChange={(checked) => {
                        setScanAllLocalImages(checked as boolean)
                        if (!checked) {
                          setLocalImageCount(0)
                        }
                      }}
                      disabled={isLoading}
                    />
                    <Label 
                      htmlFor="scan-all-local" 
                      className="font-normal cursor-pointer"
                    >
                      Scan all local images
                      {scanAllLocalImages && localImageCount > 0 && (
                        <span className="ml-2 text-muted-foreground">
                          ({localImageCount} images found)
                        </span>
                      )}
                    </Label>
                  </div>
                  
                  {!scanAllLocalImages && (
                    <>
                      <Label htmlFor="local-image">Select Docker Image</Label>
                      <DockerImageSelector
                        onImageSelect={setSelectedDockerImage}
                        disabled={isLoading}
                        className="w-full"
                      />
                    </>
                  )}
                  
                  <p className="text-xs text-muted-foreground">
                    {scanAllLocalImages 
                      ? `All ${localImageCount || 0} local Docker images will be scanned.`
                      : "Select a Docker image from your local Docker daemon."}
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

              <TabsContent value="private" className="space-y-3">
                {repositories.length === 0 ? (
                  <div className="text-center py-8">
                    <IconServer className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No Private Repositories</h3>
                    <p className="text-muted-foreground mb-4">
                      Add private repositories in the Repositories page to scan private images.
                    </p>
                    <Button variant="outline" onClick={() => window.open('/repositories', '_blank')}>
                      <IconGitBranch className="mr-2 h-4 w-4" />
                      Manage Repositories
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <Label>Select Repository and Image</Label>
                    <div className="grid gap-3">
                      {repositories.map((repo) => (
                        <div
                          key={repo.id}
                          className="border rounded-lg p-4 space-y-3"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-start gap-3">
                              {repo.type === 'DOCKERHUB' && <IconBrandDocker className="h-5 w-5 mt-0.5" />}
                              {repo.type === 'GHCR' && <IconBrandGithub className="h-5 w-5 mt-0.5" />}
                              {repo.type === 'GENERIC' && <IconServer className="h-5 w-5 mt-0.5" />}
                              <div className="space-y-1">
                                <div className="font-medium">{repo.name}</div>
                                <div className="text-sm text-muted-foreground">
                                  {repo.type === 'GENERIC' && repo.protocol ? `${repo.protocol}://${repo.registryUrl}` : repo.registryUrl}
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-2">
                              {!repositoryImages[repo.id] && !loadingImages[repo.id] && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => fetchRepositoryImages(repo)}
                                  >
                                    Load Images
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="default"
                                    onClick={async () => {
                                      setIsLoading(true);
                                      try {
                                        // Always fetch fresh images to ensure we have the latest data
                                        setLoadingImages(prev => ({ ...prev, [repo.id]: true }));
                                        const response = await fetch(`/api/repositories/${repo.id}/images`);
                                        
                                        if (!response.ok) {
                                          throw new Error(`Failed to fetch images: ${response.statusText}`);
                                        }
                                        
                                        const data = await response.json();
                                        // The API returns the images array directly, not wrapped in an object
                                        const images = Array.isArray(data) ? data : (data.images || data || []);
                                        
                                        // Update state for UI
                                        setRepositoryImages(prev => ({ ...prev, [repo.id]: images }));
                                        setLoadingImages(prev => ({ ...prev, [repo.id]: false }));
                                        
                                        if (images.length === 0) {
                                          toast.error('No images found in repository');
                                          return;
                                        }
                                        
                                        toast.info(`Starting scans for ${images.length} images...`);
                                        
                                        // Collect all scan requests in a batch
                                        const batchScanRequests = [];
                                        
                                        // Start scanning all images
                                        for (const image of images) {
                                          // Fetch actual tags for this image from the registry
                                          const tagsUrl = new URL(`/api/repositories/${repo.id}/images/${encodeURIComponent(image.name)}/tags`, window.location.origin)
                                          if (image.namespace) {
                                            tagsUrl.searchParams.append('namespace', image.namespace)
                                          }
                                          const tagsResponse = await fetch(tagsUrl.toString());
                                          
                                          if (!tagsResponse.ok) {
                                            console.error(`Failed to fetch tags for ${image.name}`);
                                            continue; // Skip this image if we can't get tags
                                          }
                                          
                                          const tagsData = await tagsResponse.json();
                                          
                                          // Extract tags - handle both array and object formats
                                          let tags = [];
                                          if (Array.isArray(tagsData)) {
                                            // If it's an array of objects with name property
                                            tags = tagsData.map((t: any) => typeof t === 'string' ? t : t.name || t.tag);
                                          } else if (tagsData.tags) {
                                            // If it has a tags property
                                            tags = Array.isArray(tagsData.tags) 
                                              ? tagsData.tags.map((t: any) => typeof t === 'string' ? t : t.name || t.tag)
                                              : [];
                                          } else if (Array.isArray(tagsData.data)) {
                                            // If it has a data property with array
                                            tags = tagsData.data.map((t: any) => typeof t === 'string' ? t : t.name || t.tag);
                                          }
                                          
                                          // Filter out any undefined/null values
                                          tags = tags.filter((t: any) => t);
                                          
                                          // If no tags found, skip this image
                                          if (tags.length === 0) {
                                            continue;
                                          }
                                          
                                          
                                          // Prepare batch scan requests for all tags
                                          const scanRequests = tags.map((tag: any) => {
                                            // Use fullName which contains the complete repository path (e.g., "hello-world" or "namespace/image")
                                            // Never include registry URL - that should be handled separately via repositoryId
                                            const imageName = image.fullName || image.name;
                                            
                                            return {
                                              image: imageName,
                                              tag: tag,
                                              source: 'registry',
                                              repositoryId: repo.id
                                            };
                                          });
                                          
                                          // Add these scan requests to the batch
                                          batchScanRequests.push(...scanRequests);
                                        }
                                        
                                        // Submit all scans as a batch
                                        if (batchScanRequests.length > 0) {
                                          
                                          try {
                                            const batchResponse = await fetch('/api/scans/start', {
                                              method: 'POST',
                                              headers: { 'Content-Type': 'application/json' },
                                              body: JSON.stringify({
                                                scans: batchScanRequests,
                                                priority: -1 // Lower priority for bulk scans
                                              })
                                            });
                                            
                                            if (batchResponse.ok) {
                                              const batchResult = await batchResponse.json();
                                              
                                              // Process batch results
                                              let successCount = 0;
                                              let failCount = 0;
                                              
                                              for (const result of batchResult.results) {
                                                if (result.success) {
                                                  addScanJob({
                                                    requestId: result.requestId,
                                                    scanId: result.scanId || '',
                                                    imageId: result.imageId || '',
                                                    imageName: `${result.image}:${result.tag}`,
                                                    status: 'RUNNING' as const,
                                                    progress: 0
                                                  });
                                                  successCount++;
                                                } else {
                                                  failCount++;
                                                }
                                              }
                                              
                                              // Show final results
                                              if (successCount > 0 && failCount === 0) {
                                                toast.success(`Successfully started ${successCount} scans`);
                                              } else if (successCount > 0 && failCount > 0) {
                                                toast.warning(`Started ${successCount} scans, ${failCount} failed`);
                                              } else if (failCount > 0) {
                                                toast.error(`Failed to start scans (${failCount} failures)`);
                                              }
                                              
                                              if (successCount > 0) {
                                                setIsOpen(false);
                                                await refreshData();
                                              }
                                            } else {
                                              const errorData = await batchResponse.json();
                                              toast.error(`Failed to submit batch scans: ${errorData.error || 'Unknown error'}`);
                                            }
                                          } catch (error) {
                                            console.error('Failed to submit batch scans:', error);
                                            toast.error('Failed to submit batch scans');
                                          }
                                        } else {
                                          toast.warning('No images with tags found to scan');
                                        }
                                      } catch (error) {
                                        console.error('Failed to scan all images:', error);
                                        toast.error('Failed to scan all images');
                                      } finally {
                                        setIsLoading(false);
                                      }
                                    }}
                                    disabled={isLoading}
                                  >
                                    {isLoading ? 'Scanning...' : 'Scan All Images'}
                                  </Button>
                                </>
                              )}
                              
                              {loadingImages[repo.id] && (
                                <div className="text-sm text-muted-foreground">Loading...</div>
                              )}
                              
                              {repositoryImages[repo.id] && repositoryImages[repo.id].length > 0 && (
                                <div className="flex items-center gap-2">
                                  <Select
                                    value={(selectedImages[repo.id]?.fullName || selectedImages[repo.id]?.name) || ""}
                                    onValueChange={(imageName) => {
                                      const image = repositoryImages[repo.id].find((img: any) => (img.fullName || img.name) === imageName)
                                      if (image) {
                                        setSelectedRepository(repo)
                                        setSelectedImages(prev => ({ ...prev, [repo.id]: image }))
                                        setSelectedTags(prev => ({ ...prev, [repo.id]: '' })) // Reset tag when image changes
                                        fetchImageTags(repo, image)
                                      }
                                    }}
                                  >
                                    <SelectTrigger className="w-[200px]">
                                      <SelectValue placeholder="Select image" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {repositoryImages[repo.id].map((image: any) => {
                                        const displayName = image.fullName || image.name;
                                        return (
                                          <SelectItem key={displayName} value={displayName}>
                                            {displayName}
                                          </SelectItem>
                                        );
                                      })}
                                    </SelectContent>
                                  </Select>
                                  
                                  {selectedImages[repo.id] && (
                                    <Select
                                      value={selectedTags[repo.id] || ""}
                                      onValueChange={(tag) => {
                                        setSelectedTags(prev => ({ ...prev, [repo.id]: tag }))
                                        setSelectedRepository(repo) // Ensure repo is selected when tag is chosen
                                      }}
                                      disabled={loadingTags[repo.id]}
                                    >
                                      <SelectTrigger className="w-[120px]">
                                        <SelectValue placeholder={loadingTags[repo.id] ? "Loading..." : "Select tag"} />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {loadingTags[repo.id] ? (
                                          <div className="p-2 text-sm text-muted-foreground">Loading tags...</div>
                                        ) : repositoryTags[repo.id] && repositoryTags[repo.id].length > 0 ? (
                                          repositoryTags[repo.id].map((tag: any) => (
                                            <SelectItem key={tag.name} value={tag.name}>
                                              {tag.name}
                                            </SelectItem>
                                          ))
                                        ) : (
                                          <div className="p-2 text-sm text-muted-foreground">No tags found</div>
                                        )}
                                      </SelectContent>
                                    </Select>
                                  )}
                                </div>
                              )}
                              
                              {repositoryImages[repo.id] && repositoryImages[repo.id].length === 0 && (
                                <div className="text-sm text-muted-foreground">No images found</div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Load images from your repositories and select an image with tag to scan.
                    </p>
                  </div>
                )}
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
              (selectedSource === 'local' && !scanAllLocalImages && !selectedDockerImage && !localImageName) ||
              (selectedSource === 'custom' && !customRegistry) ||
              (selectedSource === 'existing' && !imageUrl) ||
              (selectedSource === 'private' && (!selectedRepository || !selectedImages[selectedRepository?.id] || !selectedTags[selectedRepository?.id]))
            }
          >
            {isLoading ? 'Starting Scan...' : 
             (selectedSource === 'local' && scanAllLocalImages ? `Scan ${localImageCount} Images` : 'Start Scan')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
