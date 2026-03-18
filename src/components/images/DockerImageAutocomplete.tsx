"use client"

import * as React from "react"
import { useState, useCallback, useRef } from "react"
import { IconBrandDocker, IconStar, IconDownload, IconSearch } from "@tabler/icons-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface DockerImage {
  name: string
  description: string
  star_count: number
  pull_count: number
  is_official: boolean
  is_automated: boolean
}

interface DockerImageAutocompleteProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

export function DockerImageAutocomplete({ 
  value, 
  onChange, 
  placeholder = "e.g., nginx:latest or library/ubuntu:20.04",
  className 
}: DockerImageAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [suggestions, setSuggestions] = useState<DockerImage[]>([])
  const [loading, setLoading] = useState(false)
  const debounceTimer = useRef<NodeJS.Timeout | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const searchDockerHub = useCallback(async (query: string) => {
    if (!query || query.length < 2) {
      setSuggestions([])
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`/api/docker/search?q=${encodeURIComponent(query)}`)
      if (response.ok) {
        const data = await response.json()
        setSuggestions(data.results || [])
        if (data.results && data.results.length > 0) {
          setIsOpen(true)
        }
      }
    } catch (error) {
      console.error('Docker Hub search failed:', error)
      setSuggestions([])
    } finally {
      setLoading(false)
    }
  }, [])

  const debouncedSearch = useCallback((query: string) => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current)
    }
    debounceTimer.current = setTimeout(() => searchDockerHub(query), 300)
  }, [searchDockerHub])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    onChange(newValue)
    debouncedSearch(newValue)
  }

  const handleSelectImage = (image: DockerImage) => {
    const imageName = image.name
    onChange(`${imageName}:latest`)
    setIsOpen(false)
    setSuggestions([])
    inputRef.current?.blur()
  }

  const formatNumber = (num: number) => {
    if (num >= 1000000000) return `${(num / 1000000000).toFixed(1)}B`
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
    return num.toString()
  }

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const container = inputRef.current?.closest('.docker-autocomplete-container')
      if (container && !container.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className={cn("relative docker-autocomplete-container", className)}>
      <div className="relative">
        <IconSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
        <Input
          ref={inputRef}
          value={value}
          onChange={handleInputChange}
          placeholder={placeholder}
          className="pl-10"
          onFocus={() => {
            if (suggestions.length > 0) {
              setIsOpen(true)
            }
          }}
        />
        {loading && (
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
            <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        )}
      </div>

      {isOpen && suggestions.length > 0 && (
        <div className=" z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-72 overflow-y-auto">
          {suggestions.slice(0, 10).map((image) => (
            <Button
              key={image.name}
              variant="ghost"
              className="w-full justify-start p-3 h-auto text-left hover:bg-muted/50"
              onClick={() => handleSelectImage(image)}
            >
              <div className="flex items-center gap-3 w-full min-w-0">
                <div className="flex-shrink-0">
                  <IconBrandDocker className={cn(
                    "h-8 w-8",
                    image.is_official ? "text-blue-600" : "text-gray-600"
                  )} />
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">
                      {image.name}
                    </span>
                    {image.is_official && (
                      <Badge variant="default" className="text-xs">
                        Official
                      </Badge>
                    )}
                  </div>
                  
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                    {image.description || "No description available"}
                  </p>
                  
                  <div className="flex items-center gap-4 mt-2">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <IconStar className="h-3 w-3" />
                      {formatNumber(image.star_count)}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <IconDownload className="h-3 w-3" />
                      {formatNumber(image.pull_count)}
                    </div>
                  </div>
                </div>
              </div>
            </Button>
          ))}
          
          {suggestions.length === 0 && !loading && (
            <div className="p-3 text-center text-muted-foreground text-sm">
              No images found
            </div>
          )}
        </div>
      )}
    </div>
  )
}