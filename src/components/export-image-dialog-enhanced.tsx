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

interface Repository {
  id: string;
  name: string;
  type: string;
  registryUrl: string;
  protocol?: string;
}

interface ExportImageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageName: string;
  imageTag: string;
  patchedTarPath?: string;
  patchOperationId?: string;
}

export function ExportImageDialogEnhanced({
  open,
  onOpenChange,
  imageName,
  imageTag,
  patchedTarPath,
  patchOperationId
}: ExportImageDialogProps) {
  const [loading, setLoading] = useState(false);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selectedRepository, setSelectedRepository] = useState<string>("");
  const [customRegistry, setCustomRegistry] = useState("");
  const [targetImageName, setTargetImageName] = useState("");
  const [targetImageTag, setTargetImageTag] = useState("");
  const [useCustomRegistry, setUseCustomRegistry] = useState(false);
  const [dockerAvailable, setDockerAvailable] = useState<boolean | null>(null);
  
  // Load repositories and check Docker when dialog opens
  useEffect(() => {
    if (open) {
      setTargetImageName(imageName);
      setTargetImageTag(imageTag);
      checkDockerAvailability();
    }
  }, [open, imageName, imageTag]);
  
  // Re-fetch repositories when Docker availability changes
  useEffect(() => {
    if (open && dockerAvailable !== null) {
      fetchRepositories();
    }
  }, [dockerAvailable, open]);
  
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
        const data = await response.json();
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
            sourceImage: `${imageName}:${imageTag}`
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
          sourceImage: `${imageName}:${imageTag}`,
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
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Export Image to Registry</DialogTitle>
          <DialogDescription>
            Push {imageName}:{imageTag} to a container registry
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Target Registry</Label>
            <Select 
              value={selectedRepository} 
              onValueChange={(value) => {
                setSelectedRepository(value);
                setUseCustomRegistry(value === 'custom');
              }}
            >
              <SelectTrigger>
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
              <Label>Custom Registry URL</Label>
              <Input
                placeholder="e.g., 172.17.0.3:5000 or localhost:5000"
                value={customRegistry}
                onChange={(e) => setCustomRegistry(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Enter the registry URL without protocol (HTTP will be used for insecure registries)
              </p>
            </div>
          )}
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Target Image Name</Label>
              <Input
                value={targetImageName}
                onChange={(e) => setTargetImageName(e.target.value)}
                placeholder="Image name"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Target Image Tag</Label>
              <Input
                value={targetImageTag}
                onChange={(e) => setTargetImageTag(e.target.value)}
                placeholder="Tag"
              />
            </div>
          </div>
          
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
        
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="ghost">
            Cancel
          </Button>
          <Button 
            onClick={handleExport} 
            disabled={loading || (!selectedRepository && !customRegistry)}
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}