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
import { Search, X, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ScheduleScanFormProps {
  scan?: any;
  onSubmit: (data: any) => void;
  onCancel: () => void;
}

export function ScheduleScanForm({
  scan,
  onSubmit,
  onCancel,
}: ScheduleScanFormProps) {
  const [formData, setFormData] = React.useState({
    name: scan?.name || "",
    description: scan?.description || "",
    enabled: scan?.enabled ?? true,
    schedule: scan?.schedule || "",
    imageSelectionMode: scan?.imageSelectionMode || "SPECIFIC",
    imagePattern: scan?.imagePattern || "",
    selectedImageIds:
      scan?.selectedImages?.map((img: any) => img.imageId) || [],
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

    if (
      formData.imageSelectionMode === "SPECIFIC" &&
      formData.selectedImageIds.length === 0
    ) {
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
        <div className="space-y-2">
          <Label htmlFor="name" className="text-caption uppercase tracking-widest text-muted-foreground/60">Name *</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, name: e.target.value }))
            }
            placeholder="e.g., Weekly Security Scan"
            required
            className="rounded-none border-white/10 bg-transparent text-body-sm"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description" className="text-caption uppercase tracking-widest text-muted-foreground/60">Description</Label>
          <Textarea
            id="description"
            value={formData.description}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, description: e.target.value }))
            }
            placeholder="Describe the purpose of this scheduled scan..."
            rows={3}
            className="rounded-none border-white/10 bg-transparent text-body-sm resize-none"
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label htmlFor="enabled" className="text-caption uppercase tracking-widest text-muted-foreground/60">Enabled</Label>
            <p className="text-caption uppercase tracking-widest text-muted-foreground/40">
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

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="schedule" className="text-caption uppercase tracking-widest text-muted-foreground/60">Schedule (Cron Expression)</Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <a
                    href="http://www.cronmaker.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground/40 hover:text-accent"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </TooltipTrigger>
                <TooltipContent>
                  <p>http://www.cronmaker.com/</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <Input
            id="schedule"
            value={formData.schedule}
            onChange={(e) =>
              setFormData((prev) => ({ ...prev, schedule: e.target.value }))
            }
            placeholder="e.g., 0 2 * * * (daily at 2 AM)"
            className="rounded-none border-white/10 bg-transparent text-body-sm"
          />
          <p className="text-caption uppercase tracking-widest text-muted-foreground/40 mt-1">
            Leave empty for manual execution only
          </p>
        </div>
      </div>

      <Card className="bg-surface-1 border-white/10 rounded-none">
        <CardHeader>
          <CardTitle className="text-body-sm uppercase tracking-caps text-foreground">Image Selection</CardTitle>
          <CardDescription className="text-caption uppercase tracking-widest text-muted-foreground/50">
            Choose how images are selected for this scheduled scan
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="selectionMode" className="text-caption uppercase tracking-widest text-muted-foreground/60">Selection Mode</Label>
            <Select
              value={formData.imageSelectionMode}
              onValueChange={(value) =>
                setFormData((prev) => ({ ...prev, imageSelectionMode: value }))
              }
            >
              <SelectTrigger id="selectionMode" className="rounded-none border-white/10 text-caption uppercase tracking-widest">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-overlay border-white/10 rounded-none">
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
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground/40" />
                  <Input
                    placeholder="Search images..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8 rounded-none border-white/10 bg-transparent text-body-sm placeholder:text-muted-foreground/30"
                  />
                </div>
                {searchTerm && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setSearchTerm("")}
                    className="rounded-none hover:bg-white/5"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>

              <ScrollArea className="h-64 border border-white/10">
                <div className="p-4 space-y-2">
                  {loadingImages ? (
                    <p className="text-caption uppercase tracking-widest text-muted-foreground/40">
                      Loading images...
                    </p>
                  ) : filteredImages.length === 0 ? (
                    <p className="text-caption uppercase tracking-widest text-muted-foreground/40">
                      {searchTerm
                        ? "No images match your search"
                        : "No images available"}
                    </p>
                  ) : (
                    filteredImages.map((image) => (
                      <div
                        key={image.id}
                        className="flex items-center space-x-3 py-2 px-3 hover:bg-white/5"
                      >
                        <Checkbox
                          checked={formData.selectedImageIds.includes(image.id)}
                          onCheckedChange={() => toggleImageSelection(image.id)}
                        />
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-body-sm uppercase tracking-caps">
                              {image.name}:{image.tag}
                            </span>
                            {image.registry && (
                              <Badge variant="outline" className="rounded-full uppercase tracking-widest text-caption border-white/10">
                                {image.registry}
                              </Badge>
                            )}
                          </div>
                          {image.digest && (
                            <p className="text-caption text-muted-foreground/40">
                              {image.digest.substring(0, 20)}...
                            </p>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>

              <p className="text-caption uppercase tracking-widest text-muted-foreground/50">
                {formData.selectedImageIds.length} image(s) selected
              </p>
            </div>
          )}

          {formData.imageSelectionMode === "PATTERN" && (
            <div className="space-y-3">
              <div>
                <Label htmlFor="pattern" className="text-caption uppercase tracking-widest text-muted-foreground/60">Image Pattern (Regex)</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    id="pattern"
                    value={formData.imagePattern}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        imagePattern: e.target.value,
                      }))
                    }
                    placeholder="e.g., ^myapp:.*"
                    className="rounded-none border-white/10 bg-transparent text-body-sm"
                  />
                  <Button type="button" variant="outline" onClick={testPattern} className="rounded-none border-white/10 hover:bg-white/5 uppercase tracking-widest text-caption">
                    Test
                  </Button>
                </div>
                <p className="text-caption uppercase tracking-widest text-muted-foreground/40 mt-1">
                  Regular expression to match image names and tags
                </p>
              </div>
            </div>
          )}

          {formData.imageSelectionMode === "ALL" && (
            <p className="text-caption uppercase tracking-widest text-muted-foreground/40">
              All images in the system will be scanned
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel} className="rounded-none border-white/10 hover:bg-white/5 uppercase tracking-widest text-caption">
          Cancel
        </Button>
        <Button type="submit" className="rounded-none uppercase tracking-widest text-caption">
          {scan ? "Update Schedule" : "Create Schedule"}
        </Button>
      </div>
    </form>
  );
}
