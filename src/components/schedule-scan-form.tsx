"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { IconSearch, IconX } from "@tabler/icons-react";
import { toast } from "sonner";

interface ScheduleScanFormProps {
  scan?: any;
  onSubmit: (data: any) => void;
  onCancel: () => void;
}

export function ScheduleScanForm({ scan, onSubmit, onCancel }: ScheduleScanFormProps) {
  const [formData, setFormData] = React.useState({
    name: scan?.name || "",
    description: scan?.description || "",
    enabled: scan?.enabled ?? true,
    schedule: scan?.schedule || "",
    imageSelectionMode: scan?.imageSelectionMode || "SPECIFIC",
    imagePattern: scan?.imagePattern || "",
    selectedImageIds: scan?.selectedImages?.map((img: any) => img.imageId) || [],
  });

  const [availableImages, setAvailableImages] = React.useState<any[]>([]);
  const [loadingImages, setLoadingImages] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState("");

  React.useEffect(() => {
    fetchAvailableImages();
  }, []);

  const fetchAvailableImages = async () => {
    try {
      setLoadingImages(true);
      const response = await fetch("/api/images?limit=100");
      const data = await response.json();
      setAvailableImages(data.images || []);
    } catch (error) {
      console.error("Error fetching images:", error);
      toast.error("Failed to load available images");
    } finally {
      setLoadingImages(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate form
    if (!formData.name) {
      toast.error("Name is required");
      return;
    }

    if (formData.imageSelectionMode === "SPECIFIC" && formData.selectedImageIds.length === 0) {
      toast.error("Please select at least one image");
      return;
    }

    if (formData.imageSelectionMode === "PATTERN" && !formData.imagePattern) {
      toast.error("Please provide an image pattern");
      return;
    }

    onSubmit(formData);
  };

  const toggleImageSelection = (imageId: string) => {
    setFormData((prev) => ({
      ...prev,
      selectedImageIds: prev.selectedImageIds.includes(imageId)
        ? prev.selectedImageIds.filter((id: string) => id !== imageId)
        : [...prev.selectedImageIds, imageId],
    }));
  };

  const filteredImages = availableImages.filter((image) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      image.name.toLowerCase().includes(searchLower) ||
      image.tag.toLowerCase().includes(searchLower) ||
      `${image.name}:${image.tag}`.toLowerCase().includes(searchLower)
    );
  });

  const testPattern = () => {
    if (!formData.imagePattern) {
      toast.error("Please enter a pattern to test");
      return;
    }

    try {
      const regex = new RegExp(formData.imagePattern);
      const matches = availableImages.filter((img) =>
        regex.test(`${img.name}:${img.tag}`)
      );
      toast.success(`Pattern matches ${matches.length} images`);
    } catch (error) {
      toast.error("Invalid regex pattern");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <div>
          <Label htmlFor="name">Name *</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, name: e.target.value }))
            }
            placeholder="e.g., Weekly Security Scan"
            required
          />
        </div>

        <div>
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={formData.description}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, description: e.target.value }))
            }
            placeholder="Describe the purpose of this scheduled scan..."
            rows={3}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="enabled">Enabled</Label>
            <p className="text-sm text-muted-foreground">
              Enable or disable this scheduled scan
            </p>
          </div>
          <Switch
            id="enabled"
            checked={formData.enabled}
            onCheckedChange={(checked) =>
              setFormData((prev) => ({ ...prev, enabled: checked }))
            }
          />
        </div>

        <div>
          <Label htmlFor="schedule">Schedule (Cron Expression)</Label>
          <Input
            id="schedule"
            value={formData.schedule}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, schedule: e.target.value }))
            }
            placeholder="e.g., 0 2 * * * (daily at 2 AM)"
          />
          <p className="text-sm text-muted-foreground mt-1">
            Leave empty for manual execution only
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Image Selection</CardTitle>
          <CardDescription>
            Choose how images are selected for this scheduled scan
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="selectionMode">Selection Mode</Label>
            <Select
              value={formData.imageSelectionMode}
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, imageSelectionMode: value }))
              }
            >
              <SelectTrigger id="selectionMode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SPECIFIC">Specific Images</SelectItem>
                <SelectItem value="PATTERN">Pattern Matching</SelectItem>
                <SelectItem value="ALL">All Images</SelectItem>
                <SelectItem value="REPOSITORY" disabled>
                  Repository (Coming Soon)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formData.imageSelectionMode === "SPECIFIC" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <IconSearch className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search images..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8"
                  />
                </div>
                {searchTerm && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setSearchTerm("")}
                  >
                    <IconX className="h-4 w-4" />
                  </Button>
                )}
              </div>

              <ScrollArea className="h-64 rounded-md border">
                <div className="p-4 space-y-2">
                  {loadingImages ? (
                    <p className="text-sm text-muted-foreground">Loading images...</p>
                  ) : filteredImages.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {searchTerm ? "No images match your search" : "No images available"}
                    </p>
                  ) : (
                    filteredImages.map((image) => (
                      <div
                        key={image.id}
                        className="flex items-center space-x-3 py-2 px-3 rounded-md hover:bg-muted/50"
                      >
                        <Checkbox
                          checked={formData.selectedImageIds.includes(image.id)}
                          onCheckedChange={() => toggleImageSelection(image.id)}
                        />
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">
                              {image.name}:{image.tag}
                            </span>
                            {image.registry && (
                              <Badge variant="outline" className="text-xs">
                                {image.registry}
                              </Badge>
                            )}
                          </div>
                          {image.digest && (
                            <p className="text-xs text-muted-foreground">
                              {image.digest.substring(0, 20)}...
                            </p>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>

              <p className="text-sm text-muted-foreground">
                {formData.selectedImageIds.length} image(s) selected
              </p>
            </div>
          )}

          {formData.imageSelectionMode === "PATTERN" && (
            <div className="space-y-3">
              <div>
                <Label htmlFor="pattern">Image Pattern (Regex)</Label>
                <div className="flex gap-2">
                  <Input
                    id="pattern"
                    value={formData.imagePattern}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, imagePattern: e.target.value }))
                    }
                    placeholder="e.g., ^myapp:.*"
                  />
                  <Button type="button" variant="outline" onClick={testPattern}>
                    Test
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Regular expression to match image names and tags
                </p>
              </div>
            </div>
          )}

          {formData.imageSelectionMode === "ALL" && (
            <p className="text-sm text-muted-foreground">
              All images in the system will be scanned
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">
          {scan ? "Update Schedule" : "Create Schedule"}
        </Button>
      </div>
    </form>
  );
}