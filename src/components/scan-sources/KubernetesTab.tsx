"use client"

import { useState, useEffect, useCallback } from "react"
import {
  IconRefresh,
  IconBox,
  IconCircleFilled,
} from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { TabsContent } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type { KubeImage } from "@/lib/kubernetes/types"

interface KubernetesTabProps {
  selectedKubeImage: KubeImage | null
  setSelectedKubeImage: (image: KubeImage | null) => void
  isLoading: boolean
}

export function KubernetesTab({
  selectedKubeImage,
  setSelectedKubeImage,
  isLoading,
}: KubernetesTabProps) {
  const [available, setAvailable] = useState<boolean | null>(null)
  const [clusterName, setClusterName] = useState<string | undefined>()
  const [namespaces, setNamespaces] = useState<string[]>([])
  const [selectedNamespace, setSelectedNamespace] = useState<string>("_all")
  const [images, setImages] = useState<KubeImage[]>([])
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [loadingImages, setLoadingImages] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Check k8s availability on mount
  useEffect(() => {
    checkStatus()
  }, [])

  const checkStatus = useCallback(async () => {
    setLoadingStatus(true)
    setError(null)
    try {
      const response = await fetch("/api/kubernetes/status")
      const data = await response.json()
      setAvailable(data.available)
      setClusterName(data.clusterName)

      if (data.available) {
        fetchNamespaces()
        fetchImages()
      }
    } catch {
      setAvailable(false)
    } finally {
      setLoadingStatus(false)
    }
  }, [])

  const fetchNamespaces = async () => {
    try {
      const response = await fetch("/api/kubernetes/namespaces")
      if (response.ok) {
        const data = await response.json()
        setNamespaces(data.data || [])
      }
    } catch {
      // Namespaces are optional — image listing still works
    }
  }

  const fetchImages = async (namespace?: string) => {
    setLoadingImages(true)
    setError(null)
    try {
      const params = namespace && namespace !== "_all" ? `?namespace=${encodeURIComponent(namespace)}` : ""
      const response = await fetch(`/api/kubernetes/images${params}`)

      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData.error || "Failed to fetch images")
      }

      const data = await response.json()
      setImages(data.data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch images")
      setImages([])
    } finally {
      setLoadingImages(false)
    }
  }

  const handleNamespaceChange = (value: string) => {
    setSelectedNamespace(value)
    setSelectedKubeImage(null)
    fetchImages(value)
  }

  const handleRefresh = () => {
    setSelectedKubeImage(null)
    fetchImages(selectedNamespace)
  }

  // Loading status check
  if (loadingStatus) {
    return (
      <TabsContent value="kubernetes" className="space-y-3">
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          <span className="ml-2 text-sm text-muted-foreground">Checking Kubernetes availability...</span>
        </div>
      </TabsContent>
    )
  }

  // Not available
  if (!available) {
    return (
      <TabsContent value="kubernetes" className="space-y-3">
        <div className="text-center py-8">
          <IconBox className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-2 text-sm font-medium">Kubernetes Not Detected</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Kubernetes not detected. Deploy HarborGuard in a Kubernetes cluster or set KUBECONFIG.
          </p>
        </div>
      </TabsContent>
    )
  }

  return (
    <TabsContent value="kubernetes" className="space-y-3">
      {/* Cluster info and controls */}
      <div className="flex items-center justify-between p-2 bg-muted/50 rounded-md">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <IconBox className="h-4 w-4" />
          <span>
            Cluster: {clusterName || "unknown"}
            {images.length > 0 && (
              <>, {images.length} image{images.length !== 1 ? "s" : ""}</>
            )}
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={loadingImages}>
          <IconRefresh className={cn("h-4 w-4", loadingImages && "animate-spin")} />
        </Button>
      </div>

      {/* Namespace selector */}
      {namespaces.length > 0 && (
        <div className="space-y-1">
          <Label>Namespace</Label>
          <Select value={selectedNamespace} onValueChange={handleNamespaceChange}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All namespaces" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">All namespaces</SelectItem>
              {namespaces.map((ns) => (
                <SelectItem key={ns} value={ns}>
                  {ns}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-md p-4">
          <h3 className="text-sm font-medium text-destructive">Error loading images</h3>
          <p className="mt-1 text-sm text-destructive/80">{error}</p>
          <Button onClick={handleRefresh} variant="outline" size="sm" className="mt-2">
            Try again
          </Button>
        </div>
      )}

      {/* Loading images */}
      {loadingImages && (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          <span className="ml-2 text-sm text-muted-foreground">Loading pod images...</span>
        </div>
      )}

      {/* No images */}
      {!loadingImages && !error && images.length === 0 && (
        <div className="text-center py-8">
          <IconBox className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-2 text-sm font-medium">No Images Found</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            No container images found in running pods.
          </p>
          <Button onClick={handleRefresh} variant="outline" size="sm" className="mt-4">
            <IconRefresh className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      )}

      {/* Image list */}
      {!loadingImages && !error && images.length > 0 && (
        <div className="space-y-2 max-h-72 overflow-y-auto">
          {images.map((img) => {
            const key = `${img.namespace}/${img.image}`
            return (
              <div
                key={key}
                className={cn(
                  "p-3 border rounded-md cursor-pointer transition-colors",
                  selectedKubeImage?.image === img.image && selectedKubeImage?.namespace === img.namespace
                    ? "border-primary bg-primary/5"
                    : "hover:bg-muted/50",
                  isLoading && "opacity-50 cursor-not-allowed"
                )}
                onClick={() => !isLoading && setSelectedKubeImage(img)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <code className="font-medium text-sm truncate">{img.image}</code>
                      <IconCircleFilled
                        className={cn("h-2 w-2", img.running ? "text-green-500" : "text-muted-foreground")}
                      />
                      {img.running ? (
                        <Badge variant="outline" className="text-xs text-green-600 border-green-200">
                          running
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">
                          stopped
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span>Namespace: {img.namespace}</span>
                      <span>
                        {img.pods.length} pod{img.pods.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Select a container image from your Kubernetes cluster to scan.
      </p>
    </TabsContent>
  )
}
