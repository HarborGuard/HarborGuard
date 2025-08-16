"use client"

import * as React from "react"
import { useState, useEffect } from "react"
import {
  IconBrandDocker,
  IconBrandGithub,
  IconDeviceDesktop,
  IconLink,
  IconSearch,
  IconX,
  IconClock,
  IconStack,
  IconSettings,
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
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "sonner"
import { useApp } from "@/contexts/AppContext"
import { useScanning } from "@/providers/ScanningProvider"
import { DockerImageAutocomplete } from "@/components/DockerImageAutocomplete"
import { DockerImageSelector } from "@/components/docker-image-selector"
import { useDockerImages } from "@/hooks/useDockerImages"
import type { DockerImage, ScanSource } from "@/types"

interface EnhancedScanModalProps {
  children: React.ReactNode
}

interface ScanTemplate {
  id: string
  name: string
  description?: string
  environment: string
  scannerConfig: {
    scanners: string[]
  }
  policyConfig?: {
    maxCritical: number
    maxHigh: number
    complianceRequired: boolean
  }
  isDefault: boolean
}

export function EnhancedScanModal({ children }: EnhancedScanModalProps) {
  const { state, refreshData } = useApp()
  const { addScanJob } = useScanning()
  const { dockerInfo, images: dockerImages } = useDockerImages()
  const [isLoading, setIsLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [scanProgress, setScanProgress] = useState(0)
  const [showProgress, setShowProgress] = useState(false)
  const progressIntervalRef = React.useRef<NodeJS.Timeout | null>(null)

  // Enhanced form state
  const [scanType, setScanType] = useState<'single' | 'bulk' | 'scheduled'>('single')
  const [selectedTemplate, setSelectedTemplate] = useState<string>('')
  const [environment, setEnvironment] = useState<string>('')
  const [templates, setTemplates] = useState<ScanTemplate[]>([])
  
  // Bulk scan state
  const [bulkPatterns, setBulkPatterns] = useState({
    imagePattern: '',
    tagPattern: '',
    registryPattern: ''
  })
  const [excludePatterns, setExcludePatterns] = useState<string[]>([])
  const [maxConcurrent, setMaxConcurrent] = useState(3)
  
  // Schedule state
  const [scheduleEnabled, setScheduleEnabled] = useState(false)
  const [scheduleName, setScheduleName] = useState('')
  const [cronExpression, setCronExpression] = useState('')

  // Original form state
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedSource, setSelectedSource] = useState<string>("")
  const [imageUrl, setImageUrl] = useState("")
  const [githubRepo, setGithubRepo] = useState("")
  const [localImageName, setLocalImageName] = useState("")
  const [customRegistry, setCustomRegistry] = useState("")
  const [selectedDockerImage, setSelectedDockerImage] = useState<DockerImage | null>(null)
  const [selectedExistingImage, setSelectedExistingImage] = useState<{source: string, name: string} | null>(null)

  // Load templates
  useEffect(() => {
    if (isOpen) {
      fetchTemplates()
    }
  }, [isOpen])

  const fetchTemplates = async () => {
    try {
      const response = await fetch('/api/templates')
      const result = await response.json()
      if (result.success) {
        setTemplates(result.data)
      }
    } catch (error) {
      console.error('Error fetching templates:', error)
    }
  }

  // Progress animation functions
  const startProgressAnimation = () => {
    setScanProgress(0)
    setShowProgress(true)
    
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current)
    }
    
    progressIntervalRef.current = setInterval(() => {
      setScanProgress(prev => {
        if (prev >= 80) {
          return 80
        }
        return prev + 1
      })
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

  // Get existing images
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
      .sort((a, b) => new Date(b.lastScan).getTime() - new Date(a.lastScan).getTime())
  }, [state.scans])

  const filteredImages = existingImages.filter(image =>
    image.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const parseImageString = (imageString: string): { imageName: string; imageTag: string; registry?: string } => {
    let fullImage = imageString.trim()
    let registry: string | undefined
    let imageName: string
    let imageTag = 'latest'
    
    if (fullImage.includes('/') && (fullImage.includes('.') || fullImage.includes(':'))) {
      const parts = fullImage.split('/')
      if (parts[0].includes('.') || parts[0].includes(':')) {
        registry = parts[0]
        fullImage = parts.slice(1).join('/')
      }
    }
    
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
    try {
      setIsLoading(true)
      startProgressAnimation()

      if (scanType === 'bulk') {
        await handleBulkScan()
      } else if (scanType === 'scheduled') {
        await handleScheduledScan()
      } else {
        await handleSingleScan()
      }

      // Complete progress and close modal
      setScanProgress(100)
      setTimeout(() => {
        resetProgress()
        setIsLoading(false)
        setIsOpen(false)
        refreshData()
      }, 1000)

    } catch (error) {
      console.error('Scan failed:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to start scan')
      resetProgress()
      setIsLoading(false)
    }
  }

  const handleSingleScan = async () => {
    const imageString = getCurrentImageString()
    
    if (!imageString) {
      throw new Error("Please specify an image to scan")
    }

    let imageName: string
    let imageTag: string
    let registry: string | undefined

    if (selectedSource === 'local' && selectedDockerImage) {
      imageName = selectedDockerImage.repository
      imageTag = selectedDockerImage.tag
      registry = 'local'
    } else {
      const parsed = parseImageString(imageString)
      imageName = parsed.imageName
      imageTag = parsed.imageTag
      registry = parsed.registry
    }
    
    const scanRequest: any = {
      image: imageName,
      tag: imageTag,
      registry,
    }

    if (selectedTemplate) {
      scanRequest.templateId = selectedTemplate
    } else if (environment) {
      scanRequest.environment = environment
    }

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

    toast.success('Scan started successfully')
  }

  const handleBulkScan = async () => {
    if (!bulkPatterns.imagePattern && !bulkPatterns.tagPattern && !bulkPatterns.registryPattern) {
      throw new Error("Please specify at least one search pattern")
    }

    const bulkRequest = {
      type: 'bulk' as const,
      patterns: {
        ...(bulkPatterns.imagePattern && { imagePattern: bulkPatterns.imagePattern }),
        ...(bulkPatterns.tagPattern && { tagPattern: bulkPatterns.tagPattern }),
        ...(bulkPatterns.registryPattern && { registryPattern: bulkPatterns.registryPattern }),
      },
      excludePatterns: excludePatterns.filter(p => p.length > 0),
      maxConcurrent,
      ...(selectedTemplate && { scanTemplate: selectedTemplate }),
    }

    const response = await fetch('/api/scans/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bulkRequest),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(error || 'Failed to start bulk scan')
    }

    const result = await response.json()
    toast.success(`Bulk scan started for ${result.data.totalImages} images`)
  }

  const handleScheduledScan = async () => {
    if (!scheduleName || !cronExpression) {
      throw new Error("Please provide schedule name and cron expression")
    }

    let scanRequest: any

    if (scanType === 'bulk') {
      scanRequest = {
        type: 'bulk' as const,
        patterns: bulkPatterns,
        excludePatterns: excludePatterns.filter(p => p.length > 0),
        maxConcurrent,
      }
    } else {
      const imageString = getCurrentImageString()
      if (!imageString) {
        throw new Error("Please specify an image to scan")
      }

      const parsed = parseImageString(imageString)
      scanRequest = {
        image: parsed.imageName,
        tag: parsed.imageTag,
        registry: parsed.registry,
      }
    }

    if (selectedTemplate) {
      scanRequest.scanTemplate = selectedTemplate
    }

    const scheduleRequest = {
      name: scheduleName,
      cronExpression,
      scanRequest,
    }

    const response = await fetch('/api/schedules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(scheduleRequest),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(error || 'Failed to create schedule')
    }

    toast.success('Scan scheduled successfully')
  }

  const getScanTypeDescription = () => {
    switch (scanType) {
      case 'single':
        return 'Scan a single container image'
      case 'bulk':
        return 'Scan multiple images matching patterns'
      case 'scheduled':
        return 'Schedule recurring scans'
      default:
        return ''
    }
  }

  const selectedTemplateData = templates.find(t => t.id === selectedTemplate)

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Enhanced Container Scan</DialogTitle>
          <DialogDescription>
            {getScanTypeDescription()}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={scanType} onValueChange={(value) => setScanType(value as any)} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="single" className="flex items-center gap-2">
              <IconDeviceDesktop className="h-4 w-4" />
              Single Scan
            </TabsTrigger>
            <TabsTrigger value="bulk" className="flex items-center gap-2">
              <IconStack className="h-4 w-4" />
              Bulk Scan
            </TabsTrigger>
            <TabsTrigger value="scheduled" className="flex items-center gap-2">
              <IconClock className="h-4 w-4" />
              Scheduled
            </TabsTrigger>
          </TabsList>

          {/* Template Selection - Show for all scan types */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <IconSettings className="h-5 w-5" />
                Scan Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="template">Scan Template</Label>
                  <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a template (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">No template</SelectItem>
                      {templates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name} ({template.environment})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="environment">Environment</Label>
                  <Select value={environment} onValueChange={setEnvironment} disabled={!!selectedTemplate}>
                    <SelectTrigger>
                      <SelectValue placeholder="Auto-select template" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">No environment</SelectItem>
                      <SelectItem value="development">Development</SelectItem>
                      <SelectItem value="staging">Staging</SelectItem>
                      <SelectItem value="production">Production</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {selectedTemplateData && (
                <Card className="bg-blue-50 border-blue-200">
                  <CardContent className="p-4">
                    <h4 className="font-medium text-sm mb-2">Template Preview</h4>
                    <div className="text-sm space-y-1">
                      <div>Environment: <Badge>{selectedTemplateData.environment}</Badge></div>
                      <div>Scanners: {selectedTemplateData.scannerConfig.scanners.join(', ')}</div>
                      {selectedTemplateData.policyConfig && (
                        <div>Policy: Critical ≤ {selectedTemplateData.policyConfig.maxCritical}, High ≤ {selectedTemplateData.policyConfig.maxHigh}</div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>

          <TabsContent value="single" className="space-y-6">
            {/* Keep original single scan UI here - abbreviated for space */}
            <Card>
              <CardHeader>
                <CardTitle>Select Image Source</CardTitle>
              </CardHeader>
              <CardContent>
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
                    <TabsTrigger value="existing" className="flex items-center gap-1">
                      <IconSearch className="h-4 w-4" />
                      <span className="hidden sm:inline">Existing</span>
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="dockerhub" className="space-y-4 mt-4">
                    <div>
                      <Label htmlFor="dockerhub-image">Docker Hub Image</Label>
                      <DockerImageAutocomplete
                        value={imageUrl}
                        onChange={setImageUrl}
                        placeholder="e.g., nginx:latest, ubuntu:20.04"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Start typing to search Docker Hub images. Official images don't need 'library/' prefix.
                      </p>
                    </div>
                  </TabsContent>

                  <TabsContent value="github" className="space-y-4 mt-4">
                    <div>
                      <Label htmlFor="github-repo">GitHub Container Registry</Label>
                      <Input
                        id="github-repo"
                        placeholder="e.g., ghcr.io/owner/repo:tag"
                        value={githubRepo}
                        onChange={(e) => setGithubRepo(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Enter the full GitHub Container Registry URL including tag.
                      </p>
                    </div>
                  </TabsContent>

                  {dockerInfo?.hasAccess && (
                    <TabsContent value="local" className="space-y-4 mt-4">
                      <div>
                        <Label htmlFor="local-image">Local Docker Image</Label>
                        <DockerImageSelector
                          onImageSelect={setSelectedDockerImage}
                          disabled={false}
                          className="w-full"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Select a Docker image from your local Docker daemon.
                        </p>
                      </div>
                    </TabsContent>
                  )}

                  <TabsContent value="custom" className="space-y-4 mt-4">
                    <div>
                      <Label htmlFor="custom-registry">Custom Registry URL</Label>
                      <Input
                        id="custom-registry"
                        placeholder="e.g., registry.company.com/app:v1.0.0"
                        value={customRegistry}
                        onChange={(e) => setCustomRegistry(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Enter the full URL to your custom registry image.
                      </p>
                    </div>
                  </TabsContent>

                  <TabsContent value="existing" className="space-y-4 mt-4">
                    <div>
                      <Label htmlFor="existing-search">Previously Scanned Images</Label>
                      <div className="relative mb-3">
                        <IconSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                        <Input
                          id="existing-search"
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
                              className={`flex items-center justify-between p-3 rounded-md border cursor-pointer transition-colors ${
                                selectedExistingImage?.name === image.name ? 'bg-blue-50 border-blue-200' : 'hover:bg-muted/50'
                              }`}
                              onClick={() => {
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
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="bulk" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Bulk Scan Configuration</CardTitle>
                <CardDescription>
                  Define patterns to match multiple images. Use * as wildcard.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <Label htmlFor="imagePattern">Image Pattern</Label>
                    <Input
                      id="imagePattern"
                      value={bulkPatterns.imagePattern}
                      onChange={(e) => setBulkPatterns(prev => ({ ...prev, imagePattern: e.target.value }))}
                      placeholder="e.g., nginx*, *app*"
                    />
                  </div>
                  <div>
                    <Label htmlFor="tagPattern">Tag Pattern</Label>
                    <Input
                      id="tagPattern"
                      value={bulkPatterns.tagPattern}
                      onChange={(e) => setBulkPatterns(prev => ({ ...prev, tagPattern: e.target.value }))}
                      placeholder="e.g., latest, v*, *-prod"
                    />
                  </div>
                  <div>
                    <Label htmlFor="registryPattern">Registry Pattern</Label>
                    <Input
                      id="registryPattern"
                      value={bulkPatterns.registryPattern}
                      onChange={(e) => setBulkPatterns(prev => ({ ...prev, registryPattern: e.target.value }))}
                      placeholder="e.g., docker.io, *.company.com"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="excludePatterns">Exclude Patterns (one per line)</Label>
                  <textarea
                    className="w-full mt-1 p-2 border rounded-md"
                    rows={3}
                    value={excludePatterns.join('\n')}
                    onChange={(e) => setExcludePatterns(e.target.value.split('\n').filter(Boolean))}
                    placeholder="*:debug&#10;test/*&#10;*-temp"
                  />
                </div>

                <div>
                  <Label htmlFor="maxConcurrent">Max Concurrent Scans</Label>
                  <Select value={maxConcurrent.toString()} onValueChange={(value) => setMaxConcurrent(parseInt(value))}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                        <SelectItem key={num} value={num.toString()}>{num}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="scheduled" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Schedule Configuration</CardTitle>
                <CardDescription>
                  Set up recurring scans using cron expressions
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="scheduleName">Schedule Name</Label>
                  <Input
                    id="scheduleName"
                    value={scheduleName}
                    onChange={(e) => setScheduleName(e.target.value)}
                    placeholder="e.g., Nightly Production Scan"
                  />
                </div>

                <div>
                  <Label htmlFor="cronExpression">Cron Expression</Label>
                  <Select value={cronExpression} onValueChange={setCronExpression}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select frequency or enter custom" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0 2 * * *">Daily at 2 AM</SelectItem>
                      <SelectItem value="0 2 * * 0">Weekly on Sunday at 2 AM</SelectItem>
                      <SelectItem value="0 2 1 * *">Monthly on 1st at 2 AM</SelectItem>
                      <SelectItem value="0 */6 * * *">Every 6 hours</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    className="mt-2"
                    value={cronExpression}
                    onChange={(e) => setCronExpression(e.target.value)}
                    placeholder="Or enter custom cron expression"
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="bulkSchedule"
                    checked={scanType === 'bulk'}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        // Keep current tab but enable bulk mode for scheduling
                      }
                    }}
                  />
                  <Label htmlFor="bulkSchedule">Schedule bulk scan instead of single image</Label>
                </div>

                {/* Show bulk configuration if enabled */}
                {scanType === 'scheduled' && (
                  <Card className="bg-gray-50">
                    <CardContent className="p-4">
                      <p className="text-sm text-gray-600">
                        This will schedule a single image scan. Switch to "Bulk Scan" tab to configure bulk scheduling.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {showProgress && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Scan Progress</span>
              <span>{scanProgress}%</span>
            </div>
            <Progress value={scanProgress} />
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleStartScan} disabled={isLoading}>
            {isLoading ? 'Starting...' : 
             scanType === 'bulk' ? 'Start Bulk Scan' :
             scanType === 'scheduled' ? 'Create Schedule' :
             'Start Scan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}