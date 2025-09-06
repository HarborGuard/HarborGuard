'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { IconServer, IconClock, IconSearch } from '@tabler/icons-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { DockerImage } from '@/types'

interface DockerImageSelectorProps {
  onImageSelect: (image: DockerImage | null) => void
  disabled?: boolean
  className?: string
}

export function DockerImageSelector({ onImageSelect, disabled, className }: DockerImageSelectorProps) {
  const [allImages, setAllImages] = useState<DockerImage[]>([])
  const [filteredImages, setFilteredImages] = useState<DockerImage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedImage, setSelectedImage] = useState<DockerImage | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [searchValue, setSearchValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadImages()
  }, [])

  const loadImages = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const response = await fetch('/api/docker/images')
      if (!response.ok) {
        throw new Error('Failed to load Docker images')
      }
      
      const imageData = await response.json()
      setAllImages(imageData)
      setFilteredImages(imageData)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load Docker images'
      setError(errorMessage)
      console.error('Failed to load Docker images:', err)
    } finally {
      setLoading(false)
    }
  }

  const filterImages = useCallback((query: string) => {
    if (!query.trim()) {
      setFilteredImages(allImages)
      return
    }

    const filtered = allImages.filter(image => 
      image.fullName.toLowerCase().includes(query.toLowerCase()) ||
      image.id.toLowerCase().includes(query.toLowerCase())
    )
    setFilteredImages(filtered)
  }, [allImages])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setSearchValue(value)
    filterImages(value)
    
    // Open dropdown if there's input or if focused and has images
    if (allImages.length > 0) {
      setIsOpen(true)
    }
  }

  const handleImageSelect = (image: DockerImage) => {
    setSelectedImage(image)
    setSearchValue(image.fullName)
    setIsOpen(false)
    onImageSelect(image)
    inputRef.current?.blur()
  }

  const handleInputFocus = () => {
    if (allImages.length > 0) {
      setIsOpen(true)
    }
  }

  const formatSize = (size: string) => {
    // Docker size format is already human readable (e.g., "1.2GB", "500MB")
    return size
  }

  const formatDate = (dateStr: string) => {
    try {
      // Docker date format: "2023-12-01 15:30:45 +0000 UTC"
      const date = new Date(dateStr)
      return date.toLocaleDateString()
    } catch {
      return dateStr
    }
  }

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const container = inputRef.current?.closest('.docker-image-selector-container')
      if (container && !container.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
        <span className="ml-2 text-sm text-muted-foreground">Loading Docker images...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-destructive/10 border border-destructive/20 rounded-md p-4">
        <div className="flex">
          <div className="ml-3">
            <h3 className="text-sm font-medium text-destructive">Error loading Docker images</h3>
            <div className="mt-1 text-sm text-destructive/80">{error}</div>
            <div className="mt-2">
              <Button
                onClick={loadImages}
                variant="outline"
                size="sm"
                className="text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground"
              >
                Try again
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (allImages.length === 0 && !loading) {
    return (
      <div className="text-center py-8">
        <IconServer className="mx-auto h-12 w-12 text-muted-foreground" />
        <h3 className="mt-2 text-sm font-medium">No Docker images found</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          No local Docker images are available for scanning.
        </p>
      </div>
    )
  }

  return (
    <div className={cn("relative docker-image-selector-container", className)}>
      <div className="relative">
        <IconSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
        <Input
          ref={inputRef}
          value={searchValue}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          placeholder="Search local Docker images..."
          className="pl-10"
          disabled={disabled}
        />
        {loading && (
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
            <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        )}
      </div>

      {isOpen && filteredImages.length > 0 && (
        <div className="z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-72 overflow-y-auto">
          {filteredImages.map((image, index) => (
            <Button
              key={`${image.repository}-${image.tag}-${image.id}-${index}`}
              variant="ghost"
              className="w-full justify-start p-3 h-auto text-left hover:bg-muted/50"
              onClick={() => handleImageSelect(image)}
            >
              <div className="flex items-center gap-3 w-full min-w-0">
                <div className="flex-shrink-0">
                  <IconServer className="h-8 w-8 text-muted-foreground" />
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">
                      {image.fullName}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                    <span>ID: {image.id.slice(0, 12)}</span>
                    <span>{formatSize(image.size)}</span>
                    <div className="flex items-center gap-1">
                      <IconClock className="h-3 w-3" />
                      {formatDate(image.created)}
                    </div>
                  </div>
                </div>
              </div>
            </Button>
          ))}
        </div>
      )}
      
      {isOpen && filteredImages.length === 0 && searchValue && (
        <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg p-3">
          <div className="text-center text-muted-foreground text-sm">
            No images found matching "{searchValue}"
          </div>
        </div>
      )}
    </div>
  )
}