"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TabsContent } from "@/components/ui/tabs"

interface CustomRegistryTabProps {
  customRegistry: string
  setCustomRegistry: (value: string) => void
}

export function CustomRegistryTab({ customRegistry, setCustomRegistry }: CustomRegistryTabProps) {
  return (
    <TabsContent value="custom" className="space-y-3">
      <Label htmlFor="custom-registry">Custom Registry URL</Label>
      <Input
        id="custom-registry"
        placeholder="e.g., registry.company.com/app:v1.0.0"
        value={customRegistry}
        onChange={(e) => setCustomRegistry(e.target.value)}
      />
      <p className="text-xs text-muted-foreground">
        Enter the full URL to your custom registry image.
      </p>
    </TabsContent>
  )
}
