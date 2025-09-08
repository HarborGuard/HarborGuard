"use client";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { Download, Loader2, Package, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ExportImageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patchedTarPath: string;
  imageName: string;
  imageTag: string;
  patchOperationId: string;
}

export function ExportPatchedImageDialog({
  open,
  onOpenChange,
  patchedTarPath,
  imageName,
  imageTag,
  patchOperationId
}: ExportImageDialogProps) {
  const [loading, setLoading] = useState(false);
  const [dockerAvailable, setDockerAvailable] = useState<boolean | null>(null);
  
  // Check Docker availability when dialog opens
  useEffect(() => {
    if (open) {
      fetch('/api/docker/check')
        .then(res => res.json())
        .then(data => setDockerAvailable(data.available))
        .catch(() => setDockerAvailable(false));
    }
  }, [open]);
  
  const handleExportToDocker = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/images/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tarPath: patchedTarPath,
          imageName,
          imageTag
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to export image');
      }
      
      toast.success(`Image ${imageName}:${imageTag} loaded into Docker successfully`);
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || 'Failed to export image to Docker');
      console.error('Export error:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const handleDownloadTar = () => {
    // Create a download link for the tar file
    const link = document.createElement('a');
    link.href = `/api/patches/${patchOperationId}/download`;
    link.download = `${imageName}-${imageTag}-patched.tar`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Download started');
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Export Patched Image</DialogTitle>
          <DialogDescription>
            The patched image has been created and scanned. Choose how you want to export it.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="text-sm text-muted-foreground">
            Patched image: <span className="font-mono">{imageName}:{imageTag}</span>
          </div>
          
          {dockerAvailable === false && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Docker daemon is not available. You can download the TAR file and load it manually.
              </AlertDescription>
            </Alert>
          )}
          
          <div className="space-y-2">
            <Button
              onClick={handleExportToDocker}
              disabled={loading || dockerAvailable === false}
              className="w-full justify-start"
              variant="outline"
            >
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Package className="mr-2 h-4 w-4" />
              )}
              Load into Docker Local Registry
              {dockerAvailable === false && " (Unavailable)"}
            </Button>
            
            <Button
              onClick={handleDownloadTar}
              disabled={loading}
              className="w-full justify-start"
              variant="outline"
            >
              <Download className="mr-2 h-4 w-4" />
              Download TAR File
            </Button>
          </div>
          
          <div className="text-xs text-muted-foreground space-y-1">
            <p>• TAR files can be loaded with: <code className="bg-muted px-1 py-0.5 rounded">docker load -i file.tar</code></p>
            <p>• Or pushed to a registry with: <code className="bg-muted px-1 py-0.5 rounded">skopeo copy docker-archive:file.tar docker://registry/image:tag</code></p>
          </div>
        </div>
        
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="ghost">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}