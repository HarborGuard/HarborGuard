// Docker and Swarm types

export interface DockerImage {
  id: string;
  repository: string;
  tag: string;
  digest: string;
  size: string;
  created: string;
  fullName: string;
}

export interface DockerInfo {
  hasAccess: boolean;
  version?: string;
  swarm?: SwarmInfo;
  error?: string;
}

// Docker Swarm Types
export interface SwarmService {
  id: string;
  name: string;
  image: string;
  imageTag: string;
  replicas: {
    running: number;
    desired: number;
  };
  mode: 'replicated' | 'global';
  ports: Array<{
    published: number;
    target: number;
    protocol: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface SwarmInfo {
  active: boolean;
  nodeId?: string;
  isManager?: boolean;
  nodes?: number;
  managers?: number;
  services?: number;
}

export interface SwarmServicesResponse {
  swarmMode: boolean;
  isManager?: boolean;
  swarmInfo?: SwarmInfo;
  services: SwarmService[];
  message?: string;
  error?: string;
}
