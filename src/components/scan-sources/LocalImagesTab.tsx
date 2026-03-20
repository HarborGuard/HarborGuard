"use client"

import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { TabsContent } from "@/components/ui/tabs"
import { DockerImageSelector } from "@/components/docker-image-selector"
import type { DockerImage } from "@/types"

interface LocalImagesTabProps {
  scanAllLocalImages: boolean
  setScanAllLocalImages: (checked: boolean) => void
  localImageCount: number
  setLocalImageCount: (count: number) => void
  selectedDockerImage: DockerImage | null
  setSelectedDockerImage: (image: DockerImage | null) => void
  isLoading: boolean
}

export function LocalImagesTab({
  scanAllLocalImages,
  setScanAllLocalImages,
  localImageCount,
  setLocalImageCount,
  selectedDockerImage,
  setSelectedDockerImage,
  isLoading,
}: LocalImagesTabProps) {
  return (
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
  )
}
