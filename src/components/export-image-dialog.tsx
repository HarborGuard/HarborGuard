"use client";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ExportImageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageName: string;
  imageTag: string;
  patchedTarPath: string;
  patchOperationId: string;
}

export function ExportImageDialog({
  open,
  onOpenChange,
  imageName,
  imageTag
}: ExportImageDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export Image</DialogTitle>
          <DialogDescription>
            Export functionality for {imageName}:{imageTag}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}