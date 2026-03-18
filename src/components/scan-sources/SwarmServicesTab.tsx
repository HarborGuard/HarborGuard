"use client"

import { Label } from "@/components/ui/label"
import { TabsContent } from "@/components/ui/tabs"
import { SwarmServicesList } from "@/components/images/swarm-services-list"
import type { SwarmService } from "@/types"

interface SwarmServicesTabProps {
  selectedSwarmService: SwarmService | null
  setSelectedSwarmService: (service: SwarmService | null) => void
  isLoading: boolean
}

export function SwarmServicesTab({
  selectedSwarmService,
  setSelectedSwarmService,
  isLoading,
}: SwarmServicesTabProps) {
  return (
    <TabsContent value="swarm" className="space-y-3">
      <Label>Select Swarm Service</Label>
      <SwarmServicesList
        onServiceSelect={(service) => {
          setSelectedSwarmService(service)
        }}
        selectedService={selectedSwarmService}
        disabled={isLoading}
      />
      <p className="text-xs text-muted-foreground">
        Select a service from your Docker Swarm cluster to scan its image.
      </p>
    </TabsContent>
  )
}
