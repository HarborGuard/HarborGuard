"use client"

import { useState, useEffect } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { IconSearch } from '@tabler/icons-react'

interface ScheduleTargetFieldsProps {
  formData: {
    scanType: 'single' | 'bulk'
    image: string
    tag: string
    registry: string
    imagePattern: string
    tagPattern: string
    registryPattern: string
    excludePatterns: string[]
    maxConcurrent: number
  }
  setFormData: (updater: (prev: any) => any) => void
}

interface ExistingImage {
  id: string
  name: string
  lastScan: string
  riskScore: number
  source: string
}

export function ScheduleTargetFields({ formData, setFormData }: ScheduleTargetFieldsProps) {
  const [existingImages, setExistingImages] = useState<ExistingImage[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [showExistingImages, setShowExistingImages] = useState(false)

  // Fetch existing scanned images
  useEffect(() => {
    const fetchExistingImages = async () => {
      try {
        const response = await fetch('/api/scans')
        if (response.ok) {
          const data = await response.json()
          const scannedImages = data.scans
            ?.filter((scan: any) => scan.status === 'Complete')
            ?.map((scan: any) => ({
              id: scan.id,
              name: scan.image,
              lastScan: scan.lastScan || scan.completedAt || '',
              riskScore: scan.riskScore || 0,
              source: scan.source || 'registry'
            }))
            ?.sort((a: ExistingImage, b: ExistingImage) => 
              new Date(b.lastScan).getTime() - new Date(a.lastScan).getTime()
            ) || []
          
          setExistingImages(scannedImages)
        }
      } catch (error) {
        console.error('Error fetching existing images:', error)
      }
    }

    fetchExistingImages()
  }, [])

  const filteredImages = existingImages.filter(image =>
    image.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const parseImageString = (imageString: string) => {
    const parts = imageString.split(':')
    const imageName = parts[0]
    const tag = parts[1] || 'latest'
    
    // Check if image name contains registry
    const registryMatch = imageName.includes('/') && imageName.includes('.')
    const registry = registryMatch ? imageName.split('/')[0] : ''
    const cleanImageName = registryMatch ? imageName.split('/').slice(1).join('/') : imageName
    
    return { imageName: cleanImageName, tag, registry }
  }

  const handleSelectExistingImage = (image: ExistingImage) => {
    const { imageName, tag, registry } = parseImageString(image.name)
    setFormData(prev => ({
      ...prev,
      image: imageName,
      tag: tag,
      registry: registry
    }))
    setShowExistingImages(false)
  }

  return (
    <div className="space-y-4">
      <div>
        <Label>Scan Type</Label>
        <Select 
          value={formData.scanType || 'single'} 
          onValueChange={(value: 'single' | 'bulk') => setFormData(prev => ({ ...prev, scanType: value }))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="single">Single Image Scan</SelectItem>
            <SelectItem value="bulk">Bulk Pattern Scan</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {formData.scanType != 'bulk' ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Single Image Target</CardTitle>
            <CardDescription>Scan a specific container image</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Previously Scanned Images Section */}
            {existingImages.length > 0 && (
              <>
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Previously Scanned Images</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowExistingImages(!showExistingImages)}
                  >
                    {showExistingImages ? 'Hide' : 'Show'} ({existingImages.length})
                  </Button>
                </div>

                {showExistingImages && (
                  <div className="space-y-3">
                    <div className="relative">
                      <IconSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                      <Input
                        placeholder="Search existing images..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                    
                    <div className="max-h-40 overflow-y-auto space-y-2 border rounded-md p-2">
                      {filteredImages.length > 0 ? (
                        filteredImages.map((image) => (
                          <div
                            key={image.id}
                            className="flex items-center justify-between p-2 rounded-md border hover:bg-muted/50 cursor-pointer"
                            onClick={() => handleSelectExistingImage(image)}
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{image.name}</p>
                              <p className="text-xs text-muted-foreground">
                                Last scan: {image.lastScan ? new Date(image.lastScan).toLocaleDateString() : 'Unknown'}
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
                )}

                <Separator />
              </>
            )}

            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <Label htmlFor="registry">Registry (optional)</Label>
                <Input
                  id="registry"
                  value={formData.registry}
                  onChange={(e) => setFormData(prev => ({ ...prev, registry: e.target.value }))}
                  placeholder="e.g., docker.io, gcr.io"
                />
              </div>
              <div>
                <Label htmlFor="image">Image Name</Label>
                <Input
                  id="image"
                  value={formData.image}
                  onChange={(e) => setFormData(prev => ({ ...prev, image: e.target.value }))}
                  placeholder="e.g., nginx, ubuntu"
                  required
                />
              </div>
              <div>
                <Label htmlFor="tag">Tag</Label>
                <Input
                  id="tag"
                  value={formData.tag}
                  onChange={(e) => setFormData(prev => ({ ...prev, tag: e.target.value }))}
                  placeholder="e.g., latest, v1.0"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Bulk Scan Patterns</CardTitle>
            <CardDescription>Define patterns to match multiple images</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <Label htmlFor="imagePattern">Image Pattern</Label>
                <Input
                  id="imagePattern"
                  value={formData.imagePattern}
                  onChange={(e) => setFormData(prev => ({ ...prev, imagePattern: e.target.value }))}
                  placeholder="e.g., nginx*, *app*"
                />
              </div>
              <div>
                <Label htmlFor="tagPattern">Tag Pattern</Label>
                <Input
                  id="tagPattern"
                  value={formData.tagPattern}
                  onChange={(e) => setFormData(prev => ({ ...prev, tagPattern: e.target.value }))}
                  placeholder="e.g., latest, v*, *-prod"
                />
              </div>
              <div>
                <Label htmlFor="registryPattern">Registry Pattern</Label>
                <Input
                  id="registryPattern"
                  value={formData.registryPattern}
                  onChange={(e) => setFormData(prev => ({ ...prev, registryPattern: e.target.value }))}
                  placeholder="e.g., docker.io, *.company.com"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="excludePatterns">Exclude Patterns (one per line)</Label>
              <textarea
                className="w-full mt-1 p-2 border rounded-md"
                rows={3}
                value={formData.excludePatterns.join('\n')}
                onChange={(e) => setFormData(prev => ({ 
                  ...prev, 
                  excludePatterns: e.target.value.split('\n').filter(Boolean) 
                }))}
                placeholder="*:debug&#10;test/*&#10;*-temp"
              />
            </div>

            <div>
              <Label htmlFor="maxConcurrent">Max Concurrent Scans</Label>
              <Select 
                value={formData.maxConcurrent.toString()} 
                onValueChange={(value) => setFormData(prev => ({ ...prev, maxConcurrent: parseInt(value) }))}
              >
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
      )}
    </div>
  )
}