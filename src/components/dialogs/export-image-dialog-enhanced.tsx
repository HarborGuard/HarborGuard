"use client";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useEffect } from "react";
import { Loader2, Upload, AlertCircle, Server, Package } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getImageName, getImageTag, parseImageRef } from "@/lib/utils/image-utils";

interface Repository {
  id: string;
  name: string;
  type: string;
  registryUrl: string;
  protocol?: string;
}

interface RegistryImage {
  name: string;
  fullName: string;
  namespace?: string;
}

interface ExportImageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageName: string;
  imageTag: string;
  patchedTarPath?: string;
  patchOperationId?: string;
  scanId?: string;
  digest?: string;
}

export function ExportImageDialogEnhanced({
  open,
  onOpenChange,
  imageName,
  imageTag,
  patchedTarPath,
  patchOperationId,
  scanId,
  digest
}: ExportImageDialogProps) {
  const [loading, setLoading] = useState(false);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selectedRepository, setSelectedRepository] = useState<string>("");
  const [customRegistry, setCustomRegistry] = useState("");
  const [targetImageName, setTargetImageName] = useState("");
  const [targetImageTag, setTargetImageTag] = useState("");
  const [useCustomRegistry, setUseCustomRegistry] = useState(false);
  const [dockerAvailable, setDockerAvailable] = useState<boolean | null>(null);
  const [repositoryImages, setRepositoryImages] = useState<RegistryImage[]>([]);
  const [loadingImages, setLoadingImages] = useState(false);
  const [selectedTargetImage, setSelectedTargetImage] = useState<string>("");
  
  // Load repositories and check Docker when dialog opens
  useEffect(() => {
    if (open) {
      // Split imageName in case it contains a tag
      const { name: baseImageName, tag: embeddedTag } = parseImageRef(imageName);
      setTargetImageName(baseImageName);

      // Extract tag from imageTag if it contains a colon, otherwise use it as-is
      let finalTag = 'latest';
      if (imageTag) {
        // If imageTag contains a colon, take the part after it, otherwise use the whole imageTag
        finalTag = getImageTag(imageTag) || imageTag;
      } else if (embeddedTag && embeddedTag !== 'latest') {
        // If no imageTag but imageName had a tag embedded, use that
        finalTag = embeddedTag;
      }

      setTargetImageTag(finalTag);
      checkDockerAvailability();
    }
  }, [open, imageName, imageTag]);
  
  // Re-fetch repositories when Docker availability changes
  useEffect(() => {
    if (open && dockerAvailable !== null) {
      fetchRepositories();
    }
  }, [dockerAvailable, open]);
  
  // Fetch images when a GitLab repository is selected
  useEffect(() => {
    if (selectedRepository && selectedRepository !== 'custom' && selectedRepository !== 'docker-local') {
      const repo = repositories.find(r => r.id === selectedRepository);
      if (repo && repo.type === 'GITLAB') {
        fetchRepositoryImages(selectedRepository);
      } else {
        // Clear images for non-GitLab repositories
        setRepositoryImages([]);
        setSelectedTargetImage("");
      }
    } else {
      setRepositoryImages([]);
      setSelectedTargetImage("");
    }
  }, [selectedRepository, repositories]);
  
  const checkDockerAvailability = async () => {
    try {
      const response = await fetch('/api/docker/check');
      const data = await response.json();
      setDockerAvailable(data.available);
    } catch (error) {
      setDockerAvailable(false);
    }
  };
  
  const fetchRepositories = async () => {
    try {
      const response = await fetch('/api/repositories');
      if (response.ok) {
        const { data } = await response.json();
        const repos = [...data];
        
        // Add Docker Local option if available
        if (dockerAvailable) {
          repos.unshift({
            id: 'docker-local',
            name: 'Docker Local',
            type: 'docker-local',
            registryUrl: 'docker://local',
            protocol: ''
          });
        }
        
        // Add a custom registry option
        repos.push({
          id: 'custom',
          name: 'Custom Registry',
          type: 'custom',
          registryUrl: '',
          protocol: 'http'
        });
        
        setRepositories(repos);
      }
    } catch (error) {
      console.error('Failed to fetch repositories:', error);
    }
  };
  
  const fetchRepositoryImages = async (repositoryId: string) => {
    setLoadingImages(true);
    try {
      const response = await fetch(`/api/repositories/${repositoryId}/images`);
      if (response.ok) {
        const data = await response.json();
        setRepositoryImages(data);
        // If there's only one image or if the current image exists in the list, pre-select it
        if (data.length === 1) {
          setSelectedTargetImage(data[0].fullName);
          setTargetImageName(data[0].fullName);
        } else {
          // Try to find a matching image
          const matchingImage = data.find((img: RegistryImage) => 
            img.name === imageName || img.fullName === imageName
          );
          if (matchingImage) {
            setSelectedTargetImage(matchingImage.fullName);
            setTargetImageName(matchingImage.fullName);
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch repository images:', error);
      toast.error('Failed to fetch repository images');
    } finally {
      setLoadingImages(false);
    }
  };
  
  const handleExport = async () => {
    setLoading(true);
    
    try {
      // Handle Docker Local export
      if (selectedRepository === 'docker-local') {
        const response = await fetch('/api/images/export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tarPath: patchedTarPath,
            imageName: targetImageName,
            imageTag: targetImageTag,
            sourceImage: imageTag ? `${getImageName(imageName)}:${imageTag}` : imageName,
            scanId: scanId,
            digest: digest
          })
        });
        
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || 'Failed to load image into Docker');
        }
        
        toast.success(`Image ${targetImageName}:${targetImageTag} loaded into Docker successfully`);
        onOpenChange(false);
        return;
      }
      
      let targetRegistry = "";
      
      if (useCustomRegistry || selectedRepository === 'custom') {
        // Use custom registry
        if (!customRegistry) {
          toast.error('Please enter a registry URL');
          setLoading(false);
          return;
        }
        targetRegistry = customRegistry;
      } else if (selectedRepository) {
        // Use selected repository
        const repo = repositories.find(r => r.id === selectedRepository);
        if (repo) {
          const protocol = repo.protocol || 'https';
          targetRegistry = repo.registryUrl.includes('://') 
            ? repo.registryUrl 
            : `${protocol}://${repo.registryUrl}`;
        }
      } else {
        toast.error('Please select a registry');
        setLoading(false);
        return;
      }
      
      // Call export API
      const response = await fetch('/api/images/export-to-registry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceImage: imageTag ? `${getImageName(imageName)}:${imageTag}` : imageName,
          targetRegistry,
          targetImageName,
          targetImageTag,
          repositoryId: selectedRepository === 'custom' ? null : selectedRepository,
          patchedTarPath,
          patchOperationId
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to export image');
      }
      
      await response.json();
      toast.success(`Image exported to ${targetRegistry}/${targetImageName}:${targetImageTag}`);
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || 'Failed to export image');
      console.error('Export error:', error);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] border-white/10 rounded-none shadow-2xl p-0 overflow-hidden">
        <div className="p-8 border-b border-white/10 bg-surface-1">
          <DialogHeader className="space-y-3">
            <div className="flex items-center gap-3">
              <Upload className="h-4 w-4 text-accent" />
              <DialogTitle className="text-sm uppercase tracking-wide-caps text-foreground">Export Image to Registry</DialogTitle>
            </div>
            <DialogDescription className="text-body-sm text-muted-foreground uppercase tracking-widest">
              Push {imageName}:{imageTag} to a container registry
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="p-8 space-y-4">
          <div className="space-y-2">
            <Label className="text-caption uppercase tracking-widest text-muted-foreground/60">Target Registry</Label>
            <Select
              value={selectedRepository}
              onValueChange={(value) => {
                setSelectedRepository(value);
                setUseCustomRegistry(value === 'custom');
              }}
            >
              <SelectTrigger className="rounded-none border-white/10 bg-transparent">
                <SelectValue placeholder="Select a registry" />
              </SelectTrigger>
              <SelectContent>
                {repositories.map(repo => (
                  <SelectItem key={repo.id} value={repo.id}>
                    <div className="flex items-center">
                      {repo.id === 'docker-local' ? (
                        <Package className="mr-2 h-4 w-4" />
                      ) : (
                        <Server className="mr-2 h-4 w-4" />
                      )}
                      {repo.name} 
                      {repo.registryUrl && repo.id !== 'custom' && repo.id !== 'docker-local' && (
                        <span className="ml-2 text-muted-foreground">({repo.registryUrl})</span>
                      )}
                      {repo.id === 'docker-local' && dockerAvailable && (
                        <span className="ml-2 text-green-600">(Available)</span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {(useCustomRegistry || selectedRepository === 'custom') && (
            <div className="space-y-2">
              <Label className="text-caption uppercase tracking-widest text-muted-foreground/60">Custom Registry URL</Label>
              <Input
                placeholder="e.g., 172.17.0.3:5000 or localhost:5000"
                value={customRegistry}
                onChange={(e) => setCustomRegistry(e.target.value)}
                className="rounded-none border-white/10 bg-transparent"
              />
              <p className="text-caption uppercase tracking-widest text-muted-foreground/40">
                Enter the registry URL without protocol (HTTP will be used for insecure registries)
              </p>
            </div>
          )}
          
          {/* Show dropdown for GitLab repositories, input for others */}
          {selectedRepository && repositories.find(r => r.id === selectedRepository)?.type === 'GITLAB' ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-caption uppercase tracking-widest text-muted-foreground/60">Target Image</Label>
                {loadingImages ? (
                  <div className="flex items-center justify-center p-2 border border-white/10">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    <span className="text-caption uppercase tracking-widest text-muted-foreground/60">Loading images...</span>
                  </div>
                ) : repositoryImages.length > 0 ? (
                  <Select
                    value={selectedTargetImage}
                    onValueChange={(value) => {
                      setSelectedTargetImage(value);
                      setTargetImageName(value);
                    }}
                  >
                    <SelectTrigger className="rounded-none border-white/10 bg-transparent">
                      <SelectValue placeholder="Select target image" />
                    </SelectTrigger>
                    <SelectContent>
                      {repositoryImages.map(image => (
                        <SelectItem key={image.fullName} value={image.fullName}>
                          <div className="flex flex-col">
                            <span>{image.fullName}</span>
                            {image.namespace && (
                              <span className="text-caption uppercase tracking-widest text-muted-foreground/60">
                                Namespace: {image.namespace}
                              </span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="p-2 border border-white/10 text-caption uppercase tracking-widest text-muted-foreground/40">
                    No images found in this repository
                  </div>
                )}
                <p className="text-caption uppercase tracking-widest text-muted-foreground/40">
                  Select an existing project image to overwrite it with the patched version
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-caption uppercase tracking-widest text-muted-foreground/60">Target Image Tag</Label>
                <Input
                  value={targetImageTag}
                  onChange={(e) => setTargetImageTag(e.target.value)}
                  placeholder="Tag"
                  className="rounded-none border-white/10 bg-transparent"
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-caption uppercase tracking-widest text-muted-foreground/60">Target Image Name</Label>
                <Input
                  value={targetImageName}
                  onChange={(e) => setTargetImageName(e.target.value)}
                  placeholder="Image name"
                  className="rounded-none border-white/10 bg-transparent"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-caption uppercase tracking-widest text-muted-foreground/60">Target Image Tag</Label>
                <Input
                  value={targetImageTag}
                  onChange={(e) => setTargetImageTag(e.target.value)}
                  placeholder="Tag"
                  className="rounded-none border-white/10 bg-transparent"
                />
              </div>
            </div>
          )}
          
          {selectedRepository === 'docker-local' && (
            <Alert>
              <Package className="h-4 w-4" />
              <AlertDescription>
                The image will be loaded directly into the local Docker daemon.
                This requires Docker socket access.
              </AlertDescription>
            </Alert>
          )}
          
          {selectedRepository && selectedRepository !== 'custom' && selectedRepository !== 'docker-local' && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                The image will be pushed using the credentials configured for this repository.
              </AlertDescription>
            </Alert>
          )}
          
          {(useCustomRegistry || selectedRepository === 'custom') && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                This will attempt to push to an insecure registry without authentication.
                Make sure the registry allows anonymous push or is configured appropriately.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <div className="p-8 pt-0 flex justify-end gap-2">
          <Button onClick={() => onOpenChange(false)} variant="ghost" className="rounded-none hover:bg-white/5 text-muted-foreground uppercase tracking-widest text-caption">
            Cancel
          </Button>
          <Button
            onClick={handleExport}
            disabled={loading || (!selectedRepository && !customRegistry)}
            className="rounded-none uppercase tracking-widest text-caption"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Export to Registry
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}