"use client"

import {
  IconBrandDocker,
  IconBrandGithub,
  IconServer,
  IconGitBranch,
} from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { TabsContent } from "@/components/ui/tabs"
import { toast } from "sonner"
import type { Repository, RepositoryImage, RepositoryTag } from "@/hooks/useScanSources"
import { useScanning } from "@/providers/ScanningProvider"
import { useApp } from "@/contexts/AppContext"

interface PrivateRepositoriesTabProps {
  repositories: Repository[]
  repositoryImages: Record<string, RepositoryImage[]>
  repositoryTags: Record<string, RepositoryTag[]>
  loadingImages: Record<string, boolean>
  loadingTags: Record<string, boolean>
  selectedImages: Record<string, RepositoryImage>
  setSelectedImages: React.Dispatch<React.SetStateAction<Record<string, RepositoryImage>>>
  selectedTags: Record<string, string>
  setSelectedTags: React.Dispatch<React.SetStateAction<Record<string, string>>>
  setSelectedRepository: (repo: Repository) => void
  fetchRepositoryImages: (repo: Repository, forceRefresh?: boolean) => Promise<void>
  fetchImageTags: (repo: Repository, image: RepositoryImage) => Promise<void>
  isLoading: boolean
  setIsLoading: (loading: boolean) => void
  setIsOpen: (open: boolean) => void
}

export function PrivateRepositoriesTab({
  repositories,
  repositoryImages,
  repositoryTags,
  loadingImages,
  loadingTags,
  selectedImages,
  setSelectedImages,
  selectedTags,
  setSelectedTags,
  setSelectedRepository,
  fetchRepositoryImages,
  fetchImageTags,
  isLoading,
  setIsLoading,
  setIsOpen,
}: PrivateRepositoriesTabProps) {
  const { addScanJob } = useScanning()
  const { refreshData } = useApp()

  const handleScanAllImages = async (repo: Repository) => {
    setIsLoading(true)
    try {
      // Always fetch fresh images to ensure we have the latest data
      const response = await fetch(`/api/repositories/${repo.id}/images`)

      if (!response.ok) {
        throw new Error(`Failed to fetch images: ${response.statusText}`)
      }

      const data = await response.json()
      // The API returns the images array directly, not wrapped in an object
      const images = Array.isArray(data) ? data : (data.images || data || [])

      if (images.length === 0) {
        toast.error('No images found in repository')
        return
      }

      toast.info(`Starting scans for ${images.length} images...`)

      // Collect all scan requests in a batch
      const batchScanRequests = []

      // Start scanning all images
      for (const image of images) {
        // Fetch actual tags for this image from the registry
        const tagsUrl = new URL(`/api/repositories/${repo.id}/images/${encodeURIComponent(image.name)}/tags`, window.location.origin)
        if (image.namespace) {
          tagsUrl.searchParams.append('namespace', image.namespace)
        }
        const tagsResponse = await fetch(tagsUrl.toString())

        if (!tagsResponse.ok) {
          console.error(`Failed to fetch tags for ${image.name}`)
          continue // Skip this image if we can't get tags
        }

        const tagsData = await tagsResponse.json()

        // Extract tags - handle both array and object formats
        let tags = []
        if (Array.isArray(tagsData)) {
          tags = tagsData.map((t: any) => typeof t === 'string' ? t : t.name || t.tag)
        } else if (tagsData.tags) {
          tags = Array.isArray(tagsData.tags)
            ? tagsData.tags.map((t: any) => typeof t === 'string' ? t : t.name || t.tag)
            : []
        } else if (Array.isArray(tagsData.data)) {
          tags = tagsData.data.map((t: any) => typeof t === 'string' ? t : t.name || t.tag)
        }

        // Filter out any undefined/null values
        tags = tags.filter((t: any) => t)

        // If no tags found, skip this image
        if (tags.length === 0) {
          continue
        }

        // Prepare batch scan requests for all tags
        const scanRequests = tags.map((tag: any) => {
          const imageName = image.fullName || image.name

          return {
            image: imageName,
            tag: tag,
            source: 'registry',
            repositoryId: repo.id
          }
        })

        // Add these scan requests to the batch
        batchScanRequests.push(...scanRequests)
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
          })

          if (batchResponse.ok) {
            const batchResult = await batchResponse.json()

            // Process batch results
            let successCount = 0
            let failCount = 0

            for (const result of batchResult.results) {
              if (result.success) {
                addScanJob({
                  requestId: result.requestId,
                  scanId: result.scanId || '',
                  imageId: result.imageId || '',
                  imageName: `${result.image}:${result.tag}`,
                  status: 'RUNNING' as const,
                  progress: 0
                })
                successCount++
              } else {
                failCount++
              }
            }

            // Show final results
            if (successCount > 0 && failCount === 0) {
              toast.success(`Successfully started ${successCount} scans`)
            } else if (successCount > 0 && failCount > 0) {
              toast.warning(`Started ${successCount} scans, ${failCount} failed`)
            } else if (failCount > 0) {
              toast.error(`Failed to start scans (${failCount} failures)`)
            }

            if (successCount > 0) {
              setIsOpen(false)
              await refreshData()
            }
          } else {
            const errorData = await batchResponse.json()
            toast.error(`Failed to submit batch scans: ${errorData.error || 'Unknown error'}`)
          }
        } catch (error) {
          console.error('Failed to submit batch scans:', error)
          toast.error('Failed to submit batch scans')
        }
      } else {
        toast.warning('No images with tags found to scan')
      }
    } catch (error) {
      console.error('Failed to scan all images:', error)
      toast.error('Failed to scan all images')
    } finally {
      setIsLoading(false)
    }
  }

  return (
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
                          onClick={() => fetchRepositoryImages(repo, true)}
                        >
                          Load Images
                        </Button>
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => handleScanAllImages(repo)}
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
                            {repositoryImages[repo.id].map((image: any, index: number) => {
                              const displayName = image.fullName || image.name
                              return (
                                <SelectItem key={`${repo.id}-${index}-${displayName}`} value={displayName}>
                                  {displayName}
                                </SelectItem>
                              )
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
  )
}
