"use client"

import { useState, useEffect } from "react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Loader2, Upload, Server, Package } from "lucide-react"

interface Repository {
  id: string
  name: string
  registryUrl: string
  type: string
  protocol: string
}

interface ExportImageDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  imageName: string
  imageTag?: string
  allTags?: string[]
}

export function ExportImageDialog({
  open,
  onOpenChange,
  imageName,
  imageTag,
  allTags = []
}: ExportImageDialogProps) {
  const [loading, setLoading] = useState(false)
  const [dockerAvailable, setDockerAvailable] = useState(false)
  const [repositories, setRepositories] = useState<Repository[]>([])
  const [selectedTarget, setSelectedTarget] = useState<string>("")
  const [selectedTag, setSelectedTag] = useState<string>(imageTag || "")
  const [customRegistry, setCustomRegistry] = useState("")
  const [customTag, setCustomTag] = useState("")

  // Check Docker availability and fetch repositories
  useEffect(() => {
    if (open) {
      checkDockerAvailability()
      fetchRepositories()
      setSelectedTag(imageTag || (allTags.length > 0 ? allTags[0] : ""))
    } else {
      // Reset state when dialog closes
      setSelectedTarget("")
      setCustomRegistry("")
      setCustomTag("")
      setLoading(false)
    }
  }, [open, imageTag])

  const checkDockerAvailability = async () => {
    try {
      const response = await fetch("/api/docker/check")
      const data = await response.json()
      setDockerAvailable(data.available)
    } catch (error) {
      console.error("Failed to check Docker availability:", error)
      setDockerAvailable(false)
    }
  }

  const fetchRepositories = async () => {
    try {
      const response = await fetch("/api/repositories")
      if (response.ok) {
        const data = await response.json()
        setRepositories(data || [])
      }
    } catch (error) {
      console.error("Failed to fetch repositories:", error)
    }
  }

  const handleExport = async () => {
    if (!selectedTarget) {
      toast.error("Please select an export target")
      return
    }

    setLoading(true)
    try {
      const requestBody: any = {
        imageName,
        imageTag: selectedTag || imageTag,
      }

      if (selectedTarget === "docker-local") {
        // Just tag the image locally, no push needed
        requestBody.action = "tag"
        requestBody.targetTag = customTag || `${imageName}:${selectedTag || imageTag}`
      } else if (selectedTarget === "custom") {
        // Push to custom registry
        requestBody.action = "push"
        requestBody.targetRegistry = customRegistry
        requestBody.targetTag = customTag || selectedTag || imageTag
      } else {
        // Push to selected repository
        const repo = repositories.find(r => r.id === selectedTarget)
        if (repo) {
          requestBody.action = "push"
          requestBody.targetRegistry = repo.registryUrl
          requestBody.targetTag = customTag || selectedTag || imageTag
        }
      }

      const response = await fetch("/api/images/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      })

      const data = await response.json()

      if (response.ok) {
        toast.success(
          selectedTarget === "docker-local"
            ? `Image tagged successfully as ${requestBody.targetTag}`
            : `Image pushed successfully to ${requestBody.targetRegistry}`
        )
        onOpenChange(false)
      } else {
        throw new Error(data.error || "Export failed")
      }
    } catch (error) {
      toast.error(`Failed to export image: ${error instanceof Error ? error.message : "Unknown error"}`)
    } finally {
      setLoading(false)
    }
  }

  const availableTags = allTags.length > 0 ? allTags : (imageTag ? [imageTag] : [])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Export Image</DialogTitle>
          <DialogDescription>
            Export {imageName} to a Docker registry or save locally
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Tag Selection */}
          {availableTags.length > 1 && (
            <div className="grid gap-2">
              <Label htmlFor="tag">Select Tag</Label>
              <Select value={selectedTag} onValueChange={setSelectedTag}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a tag" />
                </SelectTrigger>
                <SelectContent>
                  {availableTags.map((tag) => (
                    <SelectItem key={tag} value={tag}>
                      {tag}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Export Target Selection */}
          <div className="grid gap-2">
            <Label htmlFor="target">Export Target</Label>
            <Select value={selectedTarget} onValueChange={setSelectedTarget}>
              <SelectTrigger>
                <SelectValue placeholder="Select export target" />
              </SelectTrigger>
              <SelectContent>
                {dockerAvailable && (
                  <SelectItem value="docker-local">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      Local Docker
                    </div>
                  </SelectItem>
                )}
                
                {repositories.map((repo) => (
                  <SelectItem key={repo.id} value={repo.id}>
                    <div className="flex items-center gap-2">
                      <Server className="h-4 w-4" />
                      {repo.name}
                      <Badge variant="outline" className="ml-2 text-xs">
                        {repo.type}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
                
                <SelectItem value="custom">
                  <div className="flex items-center gap-2">
                    <Upload className="h-4 w-4" />
                    Custom Registry
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Custom Registry Input */}
          {selectedTarget === "custom" && (
            <div className="grid gap-2">
              <Label htmlFor="custom-registry">Registry URL</Label>
              <Input
                id="custom-registry"
                placeholder="e.g., docker.io/username or ghcr.io/org"
                value={customRegistry}
                onChange={(e) => setCustomRegistry(e.target.value)}
              />
            </div>
          )}

          {/* Custom Tag Input */}
          <div className="grid gap-2">
            <Label htmlFor="custom-tag">
              Target Tag (optional)
            </Label>
            <Input
              id="custom-tag"
              placeholder={`Default: ${selectedTag || imageTag || "latest"}`}
              value={customTag}
              onChange={(e) => setCustomTag(e.target.value)}
            />
          </div>

          {/* Preview */}
          <div className="rounded-lg bg-muted p-3">
            <p className="text-sm text-muted-foreground">Preview:</p>
            <code className="text-sm font-mono">
              {selectedTarget === "docker-local"
                ? customTag || `${imageName}:${selectedTag || imageTag}`
                : selectedTarget === "custom"
                ? `${customRegistry}/${imageName}:${customTag || selectedTag || imageTag}`
                : repositories.find(r => r.id === selectedTarget)
                ? `${repositories.find(r => r.id === selectedTarget)?.registryUrl}/${imageName}:${customTag || selectedTag || imageTag}`
                : "Select a target"}
            </code>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={loading || !selectedTarget}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {selectedTarget === "docker-local" ? "Tag Image" : "Push Image"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}