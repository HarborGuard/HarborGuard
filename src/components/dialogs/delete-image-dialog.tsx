"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";

interface DeleteImageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageName: string;
  onConfirm: () => void;
}

export function DeleteImageDialog({
  open,
  onOpenChange,
  imageName,
  onConfirm,
}: DeleteImageDialogProps) {
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);

  const isConfirmValid = confirmText === imageName;

  const handleDelete = async () => {
    if (!isConfirmValid) {
      toast.error("Please type the image name to confirm deletion");
      return;
    }

    setLoading(true);
    try {
      await onConfirm();
      onOpenChange(false);
      setConfirmText("");
    } catch (error) {
      // Error handling is done in the parent component
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    onOpenChange(false);
    setConfirmText("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-white/10 rounded-none shadow-2xl p-0 overflow-hidden">
        <div className="p-8 border-b border-white/10 bg-surface-1">
          <DialogHeader className="space-y-3">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <DialogTitle className="text-sm uppercase tracking-wide-caps text-foreground">
                Delete Image
              </DialogTitle>
            </div>
            <DialogDescription className="text-body-sm text-muted-foreground uppercase tracking-widest leading-relaxed">
              This action cannot be undone. This will permanently delete the image
              and all associated scan data.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="p-8 space-y-4">
          <div className="border border-red-500/20 bg-red-950/20 p-4">
            <h4 className="text-caption text-red-400 uppercase tracking-widest mb-2">
              You are about to delete:
            </h4>
            <Badge variant="destructive" className="font-mono rounded-none">
              {imageName}
            </Badge>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-name" className="text-caption uppercase tracking-widest text-muted-foreground/60">
              Type the image name to confirm deletion
            </Label>
            <Input
              id="confirm-name"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={imageName}
              className={`font-mono rounded-none border-white/10 bg-transparent text-body-sm ${
                confirmText && !isConfirmValid
                  ? "border-red-500/50 focus:border-red-500"
                  : "focus:border-white/20"
              }`}
            />
            {confirmText && !isConfirmValid && (
              <p className="text-caption text-red-400 uppercase tracking-widest">
                Image name doesn't match
              </p>
            )}
          </div>
        </div>

        <div className="p-8 pt-0 flex justify-end gap-2">
          <Button variant="outline" onClick={handleCancel} disabled={loading} className="rounded-none border-white/10 hover:bg-white/5 uppercase tracking-widest text-caption">
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={!isConfirmValid || loading}
            className="rounded-none uppercase tracking-widest text-caption"
          >
            {loading ? "Deleting..." : "Delete Image"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}