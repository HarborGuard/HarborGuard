"use client"

import { Label } from "@/components/ui/label"
import { TabsContent } from "@/components/ui/tabs"
import { DockerImageAutocomplete } from "@/components/images/DockerImageAutocomplete"

interface DockerHubTabProps {
  imageUrl: string
  setImageUrl: (value: string) => void
}

export function DockerHubTab({ imageUrl, setImageUrl }: DockerHubTabProps) {
  return (
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
  )
}
