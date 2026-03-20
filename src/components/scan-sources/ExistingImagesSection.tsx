"use client"

import { IconSearch } from "@tabler/icons-react"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"

interface ExistingImage {
  id: string
  name: string
  lastScan: string
  riskScore: number
  source: string
}

interface ExistingImagesSectionProps {
  existingImages: ExistingImage[]
  searchQuery: string
  setSearchQuery: (query: string) => void
  onSelectImage: (image: ExistingImage) => void
}

export function ExistingImagesSection({
  existingImages,
  searchQuery,
  setSearchQuery,
  onSelectImage,
}: ExistingImagesSectionProps) {
  if (existingImages.length === 0) {
    return null
  }

  const filteredImages = existingImages.filter(image => {
    const imageName = typeof image === 'string' ? image : (image?.name || '')
    return imageName.toLowerCase().includes(searchQuery.toLowerCase())
  })

  return (
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
                onClick={() => onSelectImage(image)}
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
  )
}
