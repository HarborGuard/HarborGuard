"use client"

import * as React from "react"
import {
  Container,
  Github,
  Monitor,
  Hexagon,
  Link2,
  GitBranch,
  Layers,
  ArrowLeft,
  ArrowRight,
  Search,
  ShieldCheck,
  History,
  Check,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { useApp } from "@/contexts/AppContext"
import { useDockerImages } from "@/hooks/useDockerImages"
import { useSwarmServices } from "@/hooks/useSwarmServices"
import { useScanSources } from "@/hooks/useScanSources"
import { useScanExecution } from "@/hooks/useScanExecution"
import {
  DockerHubTab,
  GitHubTab,
  CustomRegistryTab,
  LocalImagesTab,
  SwarmServicesTab,
  KubernetesTab,
  PrivateRepositoriesTab,
} from "@/components/scan-sources"
import type { DockerImage, SwarmService } from "@/types"
import type { KubeImage } from "@/lib/kubernetes/types"

// --- Source definitions ---

interface SourceOption {
  id: string
  label: string
  description: string
  icon: React.ReactNode
  category: "registry" | "infrastructure" | "other"
  available?: boolean
}

// --- Wizard Step Indicator ---

function StepIndicator({ currentStep, totalSteps }: { currentStep: number; totalSteps: number }) {
  const steps = [
    { label: "Source", step: 1 },
    { label: "Image", step: 2 },
    { label: "Scan", step: 3 },
  ]
  return (
    <div className="flex items-center justify-center gap-2 py-4">
      {steps.slice(0, totalSteps).map((s, i) => (
        <React.Fragment key={s.step}>
          {i > 0 && (
            <div className={cn("h-px w-8 transition-colors", currentStep > s.step - 1 ? "bg-accent" : "bg-white/10")} />
          )}
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "flex h-7 w-7 items-center justify-center text-caption transition-all border",
                currentStep === s.step
                  ? "bg-accent border-accent text-white"
                  : currentStep > s.step
                    ? "bg-accent/20 border-accent/40 text-accent"
                    : "bg-transparent border-white/10 text-muted-foreground"
              )}
            >
              {currentStep > s.step ? <Check className="h-3 w-3" /> : s.step}
            </div>
            <span className={cn("text-caption uppercase tracking-widest hidden sm:inline", currentStep === s.step ? "text-foreground" : "text-muted-foreground/40")}>
              {s.label}
            </span>
          </div>
        </React.Fragment>
      ))}
    </div>
  )
}

// --- Source Card ---

function SourceCard({
  source,
  selected,
  onClick,
}: {
  source: SourceOption
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={source.available === false}
      className={cn(
        "group relative flex flex-col items-center gap-3 border p-5 text-center transition-all",
        "hover:border-accent/50 hover:bg-white/5",
        selected
          ? "border-accent bg-accent/5"
          : "border-white/10",
        source.available === false && "opacity-40 cursor-not-allowed hover:border-white/10 hover:bg-transparent"
      )}
    >
      <div className={cn(
        "flex h-10 w-10 items-center justify-center transition-colors",
        selected ? "text-accent" : "text-muted-foreground/40 group-hover:text-muted-foreground"
      )}>
        {source.icon}
      </div>
      <div>
        <p className="text-body-sm uppercase tracking-caps">{source.label}</p>
        <p className="text-caption text-muted-foreground/50 mt-0.5 uppercase tracking-widest">{source.description}</p>
      </div>
      {source.available === false && (
        <Badge variant="secondary" className="absolute top-2 right-2 text-caption rounded-none uppercase tracking-widest">Unavailable</Badge>
      )}
    </button>
  )
}

// --- Existing Image Card ---

interface ExistingImage {
  id: string
  name: string
  lastScan: string
  riskScore: number
  source: string
}

function ExistingImageCard({
  image,
  onClick,
}: {
  image: ExistingImage
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-between w-full p-3 border border-white/10 hover:border-white/20 hover:bg-white/5 transition-all text-left"
    >
      <div className="flex-1 min-w-0">
        <p className="text-body-sm truncate uppercase tracking-caps">{image.name}</p>
        <p className="text-caption text-muted-foreground/50 mt-0.5 uppercase tracking-widest">
          Last scan: {new Date(image.lastScan).toLocaleDateString()}
        </p>
      </div>
      <Badge
        variant={image.riskScore > 70 ? "destructive" : image.riskScore > 40 ? "secondary" : "default"}
        className="ml-3 shrink-0 rounded-none"
      >
        {image.riskScore}
      </Badge>
    </button>
  )
}

// --- Main Component ---

interface NewScanModalProps {
  children: React.ReactNode
}

export function NewScanModal({ children }: NewScanModalProps) {
  const { state } = useApp()
  const { dockerInfo, images: dockerImages } = useDockerImages()
  const { isSwarmMode } = useSwarmServices()
  const scanSources = useScanSources()

  const [isOpen, setIsOpen] = React.useState(false)
  const [step, setStep] = React.useState(1)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [selectedSource, setSelectedSource] = React.useState<string>("")
  const [imageUrl, setImageUrl] = React.useState("")
  const [githubRepo, setGithubRepo] = React.useState("")
  const [localImageName, setLocalImageName] = React.useState("")
  const [customRegistry, setCustomRegistry] = React.useState("")
  const [selectedDockerImage, setSelectedDockerImage] = React.useState<DockerImage | null>(null)
  const [selectedExistingImage, setSelectedExistingImage] = React.useState<{ source: string; name: string } | null>(null)
  const [selectedSwarmService, setSelectedSwarmService] = React.useState<SwarmService | null>(null)
  const [selectedKubeImage, setSelectedKubeImage] = React.useState<KubeImage | null>(null)
  const [scanAllLocalImages, setScanAllLocalImages] = React.useState(false)

  const { isLoading, setIsLoading, showProgress, scanProgress, handleStartScan } = useScanExecution(
    {
      selectedSource,
      imageUrl,
      githubRepo,
      localImageName,
      customRegistry,
      selectedDockerImage,
      selectedExistingImage,
      selectedSwarmService,
      selectedKubeImage,
      scanAllLocalImages,
      selectedRepository: scanSources.selectedRepository,
      selectedImages: scanSources.selectedImages,
      selectedTags: scanSources.selectedTags,
      dockerImages,
    },
    {
      setSelectedSource,
      setImageUrl,
      setGithubRepo,
      setLocalImageName,
      setCustomRegistry,
      setSelectedDockerImage,
      setSelectedSwarmService,
      setSelectedKubeImage,
      setSearchQuery,
      setScanAllLocalImages,
      setLocalImageCount: scanSources.setLocalImageCount,
      setIsOpen,
    }
  )

  // Reset wizard state when modal opens/closes
  React.useEffect(() => {
    if (isOpen) {
      setStep(1)
      setSelectedSource("")
      scanSources.fetchRepositories()
    }
  }, [isOpen])

  React.useEffect(() => {
    if (scanAllLocalImages && dockerInfo?.hasAccess) {
      scanSources.fetchLocalImageCount()
    }
  }, [scanAllLocalImages, dockerInfo?.hasAccess])

  // Build available sources
  const sources: SourceOption[] = React.useMemo(() => {
    const list: SourceOption[] = [
      {
        id: "dockerhub",
        label: "Docker Hub",
        description: "Public & private images",
        icon: <Container className="h-6 w-6" />,
        category: "registry",
      },
      {
        id: "github",
        label: "GitHub (GHCR)",
        description: "GitHub Container Registry",
        icon: <Github className="h-6 w-6" />,
        category: "registry",
      },
      {
        id: "custom",
        label: "Custom Registry",
        description: "Any OCI-compatible registry",
        icon: <Link2 className="h-6 w-6" />,
        category: "registry",
      },
      {
        id: "private",
        label: "Private Registry",
        description: "Configured repositories",
        icon: <GitBranch className="h-6 w-6" />,
        category: "registry",
        available: scanSources.repositories.length > 0,
      },
    ]

    if (dockerInfo?.hasAccess) {
      list.push({
        id: "local",
        label: "Local Docker",
        description: "Images on this host",
        icon: <Monitor className="h-6 w-6" />,
        category: "infrastructure",
      })
    }

    if (dockerInfo?.hasAccess && isSwarmMode) {
      list.push({
        id: "swarm",
        label: "Docker Swarm",
        description: "Swarm service images",
        icon: <Layers className="h-6 w-6" />,
        category: "infrastructure",
      })
    }

    list.push({
      id: "kubernetes",
      label: "Kubernetes",
      description: "Pod container images",
      icon: <Hexagon className="h-6 w-6" />,
      category: "infrastructure",
    })

    return list
  }, [dockerInfo, isSwarmMode, scanSources.repositories])

  // Derive existing images
  const existingImages = React.useMemo(() => {
    const imageMap = new Map<string, ExistingImage>()
    state.scans
      .filter((scan) => scan.status === "Complete")
      .forEach((scan) => {
        const imageName =
          typeof scan.image === "string"
            ? scan.image
            : `${(scan.image as any)?.name}:${(scan.image as any)?.tag}`
        const existing = imageMap.get(imageName)
        if (!existing || new Date(scan.lastScan || "").getTime() > new Date(existing.lastScan).getTime()) {
          imageMap.set(imageName, {
            id: `${scan.id}_${imageName}_${scan.lastScan}`,
            name: imageName,
            lastScan: scan.lastScan || "",
            riskScore: scan.riskScore,
            source: scan.source || "registry",
          })
        }
      })
    return Array.from(imageMap.values()).sort(
      (a, b) => new Date(b.lastScan).getTime() - new Date(a.lastScan).getTime()
    )
  }, [state.scans])

  const filteredExistingImages = existingImages.filter((img) =>
    img.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Get display label for the selected source
  const selectedSourceLabel = sources.find((s) => s.id === selectedSource)?.label || selectedSource

  // Check if image selection is valid for current source
  const isImageSelected =
    (selectedSource === "dockerhub" && !!imageUrl) ||
    (selectedSource === "github" && !!githubRepo) ||
    (selectedSource === "local" && (scanAllLocalImages || !!selectedDockerImage || !!localImageName)) ||
    (selectedSource === "custom" && !!customRegistry) ||
    (selectedSource === "existing" && !!imageUrl) ||
    (selectedSource === "swarm" && !!selectedSwarmService) ||
    (selectedSource === "kubernetes" && !!selectedKubeImage) ||
    (selectedSource === "private" &&
      !!scanSources.selectedRepository &&
      !!scanSources.selectedImages[scanSources.selectedRepository?.id] &&
      !!scanSources.selectedTags[scanSources.selectedRepository?.id])

  // Get human-readable selected image name for review
  const getSelectedImageDisplay = (): string => {
    switch (selectedSource) {
      case "dockerhub": return imageUrl || "—"
      case "github": return githubRepo || "—"
      case "local":
        if (scanAllLocalImages) return `All local images (${scanSources.localImageCount})`
        return selectedDockerImage?.fullName || localImageName || "—"
      case "custom": return customRegistry || "—"
      case "existing": return imageUrl || "—"
      case "swarm": return selectedSwarmService ? `${selectedSwarmService.image}:${selectedSwarmService.imageTag}` : "—"
      case "kubernetes": return selectedKubeImage?.image || "—"
      case "private": {
        if (!scanSources.selectedRepository) return "—"
        const img = scanSources.selectedImages[scanSources.selectedRepository.id]
        const tag = scanSources.selectedTags[scanSources.selectedRepository.id]
        return img && tag ? `${img.fullName || img.name}:${tag}` : "—"
      }
      default: return "—"
    }
  }

  const handleSelectExisting = (image: ExistingImage) => {
    setSelectedSource("existing")
    setImageUrl(image.name)
    setSelectedExistingImage({ source: image.source, name: image.name })
    setStep(3) // Jump straight to review
  }

  const handleSourceSelect = (sourceId: string) => {
    setSelectedSource(sourceId)
    setStep(2)
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-0 border-white/10 rounded-none shadow-2xl">
        {/* Header */}
        <div className="px-8 pt-8 pb-4 border-b border-white/10 bg-surface-1">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-4 w-4 text-accent" />
            <div>
              <DialogTitle className="text-sm uppercase tracking-wide-caps text-foreground">New Security Scan</DialogTitle>
              <DialogDescription className="text-caption text-muted-foreground/50 uppercase tracking-widest mt-0.5">
                {step === 1 && "Choose where to scan from"}
                {step === 2 && `Select an image from ${selectedSourceLabel}`}
                {step === 3 && "Review and start scan"}
              </DialogDescription>
            </div>
          </div>
          <StepIndicator currentStep={step} totalSteps={3} />
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto px-8 pb-2">
          {/* ============ STEP 1: Choose Source ============ */}
          {step === 1 && (
            <div className="space-y-6 pb-4">
              {/* Previously scanned — quick rescan */}
              {existingImages.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-caption text-muted-foreground/60 uppercase tracking-widest">
                    <History className="h-3.5 w-3.5" />
                    Quick Rescan
                  </div>

                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search previously scanned images..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 h-9"
                    />
                  </div>

                  <div className="max-h-36 overflow-y-auto space-y-1 border border-white/10 p-2">
                    {filteredExistingImages.length > 0 ? (
                      filteredExistingImages.slice(0, 10).map((image) => (
                        <ExistingImageCard key={image.id} image={image} onClick={() => handleSelectExisting(image)} />
                      ))
                    ) : (
                      <p className="text-center text-caption text-muted-foreground/40 uppercase tracking-widest py-3">No matching images</p>
                    )}
                  </div>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-white/10" />
                    </div>
                    <div className="relative flex justify-center text-caption uppercase tracking-widest">
                      <span className="bg-background px-2 text-muted-foreground/40">or scan new image</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Source cards grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {sources.map((source) => (
                  <SourceCard
                    key={source.id}
                    source={source}
                    selected={selectedSource === source.id}
                    onClick={() => handleSourceSelect(source.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ============ STEP 2: Select Image ============ */}
          {step === 2 && (
            <div className="space-y-4 pb-4">
              {selectedSource === "dockerhub" && (
                <DockerHubTab imageUrl={imageUrl} setImageUrl={setImageUrl} />
              )}
              {selectedSource === "github" && (
                <GitHubTab githubRepo={githubRepo} setGithubRepo={setGithubRepo} />
              )}
              {selectedSource === "local" && dockerInfo?.hasAccess && (
                <LocalImagesTab
                  scanAllLocalImages={scanAllLocalImages}
                  setScanAllLocalImages={setScanAllLocalImages}
                  localImageCount={scanSources.localImageCount}
                  setLocalImageCount={scanSources.setLocalImageCount}
                  selectedDockerImage={selectedDockerImage}
                  setSelectedDockerImage={setSelectedDockerImage}
                  isLoading={isLoading}
                />
              )}
              {selectedSource === "custom" && (
                <CustomRegistryTab customRegistry={customRegistry} setCustomRegistry={setCustomRegistry} />
              )}
              {selectedSource === "swarm" && dockerInfo?.hasAccess && isSwarmMode && (
                <SwarmServicesTab
                  selectedSwarmService={selectedSwarmService}
                  setSelectedSwarmService={setSelectedSwarmService}
                  isLoading={isLoading}
                />
              )}
              {selectedSource === "kubernetes" && (
                <KubernetesTab
                  selectedKubeImage={selectedKubeImage}
                  setSelectedKubeImage={setSelectedKubeImage}
                  isLoading={isLoading}
                />
              )}
              {selectedSource === "private" && (
                <PrivateRepositoriesTab
                  repositories={scanSources.repositories}
                  repositoryImages={scanSources.repositoryImages}
                  repositoryTags={scanSources.repositoryTags}
                  loadingImages={scanSources.loadingImages}
                  loadingTags={scanSources.loadingTags}
                  selectedImages={scanSources.selectedImages}
                  setSelectedImages={scanSources.setSelectedImages}
                  selectedTags={scanSources.selectedTags}
                  setSelectedTags={scanSources.setSelectedTags}
                  setSelectedRepository={scanSources.setSelectedRepository}
                  fetchRepositoryImages={scanSources.fetchRepositoryImages}
                  fetchImageTags={scanSources.fetchImageTags}
                  isLoading={isLoading}
                  setIsLoading={setIsLoading}
                  setIsOpen={setIsOpen}
                />
              )}
            </div>
          )}

          {/* ============ STEP 3: Review & Scan ============ */}
          {step === 3 && (
            <div className="space-y-6 pb-4">
              <div className="border border-white/10 bg-surface-1 p-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center text-accent">
                    {sources.find((s) => s.id === selectedSource)?.icon || (
                      <ShieldCheck className="h-5 w-5" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-caption text-muted-foreground/50 uppercase tracking-widest">Source</p>
                    <p className="text-body-sm uppercase tracking-caps">{selectedSourceLabel}</p>
                    <div className="mt-3">
                      <p className="text-caption text-muted-foreground/50 uppercase tracking-widest">Image</p>
                      <code className="text-body-sm break-all text-foreground">{getSelectedImageDisplay()}</code>
                    </div>
                  </div>
                </div>
              </div>

              {showProgress && (
                <div className="space-y-2">
                  <div className="flex justify-between text-caption uppercase tracking-widest">
                    <span className="text-muted-foreground/60">Initializing scan...</span>
                    <span className="text-foreground">{scanProgress}%</span>
                  </div>
                  <Progress value={scanProgress} className="h-2" />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-white/10 px-8 py-4 bg-surface-1">
          <div>
            {step > 1 && (
              <Button variant="ghost" size="sm" onClick={() => setStep(step - 1)} disabled={isLoading} className="rounded-none hover:bg-white/5 text-muted-foreground uppercase tracking-widest text-caption">
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <DialogClose asChild>
              <Button variant="outline" size="sm" disabled={isLoading} className="rounded-none border-white/10 hover:bg-white/5 uppercase tracking-widest text-caption">
                Cancel
              </Button>
            </DialogClose>

            {step === 2 && (
              <Button
                size="sm"
                onClick={() => setStep(3)}
                disabled={!isImageSelected}
                className="rounded-none uppercase tracking-widest text-caption"
              >
                Review
                <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            )}

            {step === 3 && (
              <Button
                size="sm"
                onClick={handleStartScan}
                disabled={!isImageSelected || isLoading}
                className="rounded-none uppercase tracking-widest text-caption"
              >
                {isLoading ? "Starting..." : selectedSource === "local" && scanAllLocalImages
                  ? `Scan ${scanSources.localImageCount} Images`
                  : "Start Scan"
                }
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
