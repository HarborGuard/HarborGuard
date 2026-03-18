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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-5 w-5" />
            Delete Image
          </DialogTitle>
          <DialogDescription>
            This action cannot be undone. This will permanently delete the image
            and all associated scan data.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <h4 className="font-medium text-red-800 mb-2">
              You are about to delete:
            </h4>
            <Badge variant="destructive" className="font-mono">
              {imageName}
            </Badge>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-name">
              Type the image name to confirm deletion
            </Label>
            <Input
              id="confirm-name"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={imageName}
              className={`font-mono ${
                confirmText && !isConfirmValid
                  ? "border-red-300 focus:border-red-500"
                  : ""
              }`}
            />
            {confirmText && !isConfirmValid && (
              <p className="text-sm text-red-600">
                Image name doesn't match
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleCancel} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={!isConfirmValid || loading}
          >
            {loading ? "Deleting..." : "Delete Image"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}