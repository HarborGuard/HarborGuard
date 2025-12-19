'use client';

import { useState } from 'react';
import {
  IconServer,
  IconRefresh,
  IconStack2,
  IconWorld,
  IconCopy,
  IconCheck,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useSwarmServices } from '@/hooks/useSwarmServices';
import type { SwarmService } from '@/types';

interface SwarmServicesListProps {
  onServiceSelect?: (service: SwarmService) => void;
  selectedService?: SwarmService | null;
  disabled?: boolean;
  className?: string;
}

export function SwarmServicesList({
  onServiceSelect,
  selectedService,
  disabled,
  className
}: SwarmServicesListProps) {
  const { services, swarmInfo, isSwarmMode, isManager, loading, error, refetch } = useSwarmServices();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyImageName = (service: SwarmService, e: React.MouseEvent) => {
    e.stopPropagation();
    const fullName = `${service.image}:${service.imageTag}`;
    navigator.clipboard.writeText(fullName);
    setCopiedId(service.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Not in Swarm mode
  if (!isSwarmMode) {
    return (
      <div className="text-center py-8">
        <IconStack2 className="mx-auto h-12 w-12 text-muted-foreground" />
        <h3 className="mt-2 text-sm font-medium">Not in Swarm Mode</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Docker is not running in Swarm mode. Deploy HarborGuard in a Swarm cluster to use this feature.
        </p>
      </div>
    );
  }

  // Not a manager node
  if (!isManager) {
    return (
      <div className="text-center py-8">
        <IconWorld className="mx-auto h-12 w-12 text-muted-foreground" />
        <h3 className="mt-2 text-sm font-medium">Manager Node Required</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          This node is a worker. Deploy HarborGuard on a manager node to list Swarm services.
        </p>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
        <span className="ml-2 text-sm text-muted-foreground">Loading Swarm services...</span>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="bg-destructive/10 border border-destructive/20 rounded-md p-4">
        <h3 className="text-sm font-medium text-destructive">Error loading Swarm services</h3>
        <p className="mt-1 text-sm text-destructive/80">{error}</p>
        <Button onClick={refetch} variant="outline" size="sm" className="mt-2">
          Try again
        </Button>
      </div>
    );
  }

  // No services
  if (services.length === 0) {
    return (
      <div className="text-center py-8">
        <IconServer className="mx-auto h-12 w-12 text-muted-foreground" />
        <h3 className="mt-2 text-sm font-medium">No Services Found</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          No services are currently running in this Swarm cluster.
        </p>
        <Button onClick={refetch} variant="outline" size="sm" className="mt-4">
          <IconRefresh className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {/* Swarm Info Header */}
      <div className="flex items-center justify-between mb-4 p-2 bg-muted/50 rounded-md">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <IconStack2 className="h-4 w-4" />
          <span>
            Swarm: {swarmInfo?.nodes} node{swarmInfo?.nodes !== 1 ? 's' : ''},
            {' '}{services.length} service{services.length !== 1 ? 's' : ''}
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={refetch} disabled={loading}>
          <IconRefresh className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
      </div>

      {/* Services List */}
      <div className="space-y-2 max-h-72 overflow-y-auto">
        {services.map((service) => (
          <div
            key={service.id}
            className={cn(
              "p-3 border rounded-md cursor-pointer transition-colors",
              selectedService?.id === service.id
                ? "border-primary bg-primary/5"
                : "hover:bg-muted/50",
              disabled && "opacity-50 cursor-not-allowed"
            )}
            onClick={() => !disabled && onServiceSelect?.(service)}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm truncate">{service.name}</span>
                  <Badge variant={service.mode === 'global' ? 'secondary' : 'outline'} className="text-xs">
                    {service.mode}
                  </Badge>
                </div>

                <div className="flex items-center gap-2 mt-1">
                  <code className="text-xs text-muted-foreground bg-muted px-1 py-0.5 rounded">
                    {service.image}:{service.imageTag}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0"
                    onClick={(e) => copyImageName(service, e)}
                  >
                    {copiedId === service.id ? (
                      <IconCheck className="h-3 w-3 text-green-500" />
                    ) : (
                      <IconCopy className="h-3 w-3" />
                    )}
                  </Button>
                </div>

                <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                  <span>
                    Replicas: {service.replicas.running}/{service.replicas.desired}
                  </span>
                  {service.ports.length > 0 && (
                    <span>
                      Ports: {service.ports.map(p => `${p.published}:${p.target}`).join(', ')}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
