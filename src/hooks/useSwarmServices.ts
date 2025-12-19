'use client';

import { useState, useEffect, useCallback } from 'react';
import type { SwarmService, SwarmInfo, SwarmServicesResponse } from '@/types';

interface UseSwarmServicesReturn {
  services: SwarmService[];
  swarmInfo: SwarmInfo | null;
  isSwarmMode: boolean;
  isManager: boolean;
  loading: boolean;
  error: string | null;
  message: string | null;
  refetch: () => Promise<void>;
}

export function useSwarmServices(): UseSwarmServicesReturn {
  const [services, setServices] = useState<SwarmService[]>([]);
  const [swarmInfo, setSwarmInfo] = useState<SwarmInfo | null>(null);
  const [isSwarmMode, setIsSwarmMode] = useState(false);
  const [isManager, setIsManager] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const fetchServices = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch('/api/docker/services');
      const data: SwarmServicesResponse = await response.json();

      setIsSwarmMode(data.swarmMode);
      setIsManager(data.isManager ?? false);
      setSwarmInfo(data.swarmInfo ?? null);
      setServices(data.services);
      setMessage(data.message ?? null);

      if (data.error) {
        setError(data.error);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch Swarm services';
      setError(errorMessage);
      setServices([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  return {
    services,
    swarmInfo,
    isSwarmMode,
    isManager,
    loading,
    error,
    message,
    refetch: fetchServices,
  };
}
