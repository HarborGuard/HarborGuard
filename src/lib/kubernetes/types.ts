// Kubernetes types for pod image discovery

export interface KubeImage {
  image: string;
  name: string; // image name without tag
  tag: string;
  pods: string[]; // pod names using this image
  namespace: string;
  running: boolean;
}

export interface KubeStatusResponse {
  available: boolean;
  clusterName?: string;
  namespace?: string;
}

export interface KubeImagesResponse {
  data: KubeImage[];
  total: number;
}

export interface KubeNamespacesResponse {
  data: string[];
}

// Minimal Kubernetes API response types

export interface KubePodList {
  kind: string;
  items: KubePod[];
}

export interface KubePod {
  metadata: {
    name: string;
    namespace: string;
  };
  spec: {
    containers: KubeContainer[];
    initContainers?: KubeContainer[];
  };
  status: {
    phase: string;
    containerStatuses?: KubeContainerStatus[];
    initContainerStatuses?: KubeContainerStatus[];
  };
}

export interface KubeContainer {
  name: string;
  image: string;
}

export interface KubeContainerStatus {
  name: string;
  image: string;
  state: {
    running?: Record<string, unknown>;
    waiting?: Record<string, unknown>;
    terminated?: Record<string, unknown>;
  };
}

export interface KubeNamespaceList {
  kind: string;
  items: Array<{
    metadata: {
      name: string;
    };
  }>;
}

export interface KubeConfig {
  apiVersion: string;
  clusters: Array<{
    name: string;
    cluster: {
      server: string;
      'certificate-authority-data'?: string;
    };
  }>;
  contexts: Array<{
    name: string;
    context: {
      cluster: string;
      user: string;
      namespace?: string;
    };
  }>;
  'current-context': string;
  users: Array<{
    name: string;
    user: {
      token?: string;
    };
  }>;
}
