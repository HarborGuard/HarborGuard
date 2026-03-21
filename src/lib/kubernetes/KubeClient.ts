import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type {
  KubeImage,
  KubePodList,
  KubePod,
  KubeNamespaceList,
  KubeConfig,
} from './types';

const IN_CLUSTER_TOKEN_PATH = '/var/run/secrets/kubernetes.io/serviceaccount/token';
const IN_CLUSTER_CA_PATH = '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt';
const IN_CLUSTER_NAMESPACE_PATH = '/var/run/secrets/kubernetes.io/serviceaccount/namespace';

/**
 * Lightweight Kubernetes client that uses Node.js fetch to call the k8s API.
 *
 * Supports:
 * - In-cluster auth (service account token)
 * - External auth via KUBECONFIG or ~/.kube/config (bearer token only)
 *
 * This avoids pulling in the heavy @kubernetes/client-node dependency.
 */
export class KubeClient {
  private apiServer: string;
  private token: string;
  private caCert?: string;
  private clusterName?: string;
  private defaultNamespace?: string;

  constructor() {
    this.apiServer = '';
    this.token = '';
    this.configure();
  }

  /**
   * Attempt to configure from in-cluster, then KUBECONFIG, then ~/.kube/config.
   */
  private configure(): void {
    // 1. Try in-cluster config
    if (this.tryInClusterConfig()) {
      return;
    }

    // 2. Try KUBECONFIG env var
    const kubeconfigEnv = process.env.KUBECONFIG;
    if (kubeconfigEnv && this.tryKubeconfig(kubeconfigEnv)) {
      return;
    }

    // 3. Try default ~/.kube/config
    const defaultPath = path.join(os.homedir(), '.kube', 'config');
    if (this.tryKubeconfig(defaultPath)) {
      return;
    }
  }

  /**
   * Try to load in-cluster service account credentials.
   */
  private tryInClusterConfig(): boolean {
    try {
      if (!fs.existsSync(IN_CLUSTER_TOKEN_PATH)) {
        return false;
      }

      this.token = fs.readFileSync(IN_CLUSTER_TOKEN_PATH, 'utf8').trim();
      this.apiServer = `https://${process.env.KUBERNETES_SERVICE_HOST}:${process.env.KUBERNETES_SERVICE_PORT}`;
      this.clusterName = 'in-cluster';

      if (fs.existsSync(IN_CLUSTER_CA_PATH)) {
        this.caCert = fs.readFileSync(IN_CLUSTER_CA_PATH, 'utf8');
      }

      if (fs.existsSync(IN_CLUSTER_NAMESPACE_PATH)) {
        this.defaultNamespace = fs.readFileSync(IN_CLUSTER_NAMESPACE_PATH, 'utf8').trim();
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Try to load config from a kubeconfig file.
   * Supports a simple YAML-like parser for bearer token auth.
   */
  private tryKubeconfig(configPath: string): boolean {
    try {
      if (!fs.existsSync(configPath)) {
        return false;
      }

      const raw = fs.readFileSync(configPath, 'utf8');
      const config = this.parseSimpleYaml(raw);

      if (!config) {
        return false;
      }

      const currentContext = config['current-context'];
      if (!currentContext) {
        return false;
      }

      const context = config.contexts?.find(
        (c: KubeConfig['contexts'][0]) => c.name === currentContext
      );
      if (!context) {
        return false;
      }

      const cluster = config.clusters?.find(
        (c: KubeConfig['clusters'][0]) => c.name === context.context.cluster
      );
      if (!cluster) {
        return false;
      }

      const user = config.users?.find(
        (u: KubeConfig['users'][0]) => u.name === context.context.user
      );

      this.apiServer = cluster.cluster.server;
      this.clusterName = cluster.name;
      this.defaultNamespace = context.context.namespace;

      if (user?.user?.token) {
        this.token = user.user.token;
      }

      if (cluster.cluster['certificate-authority-data']) {
        this.caCert = Buffer.from(
          cluster.cluster['certificate-authority-data'],
          'base64'
        ).toString('utf8');
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Minimal JSON-based kubeconfig parser.
   * kubeconfig files can be JSON or YAML. We attempt JSON first,
   * then fall back to a line-by-line YAML parser that handles
   * the subset of YAML used in kubeconfig files.
   */
  private parseSimpleYaml(content: string): KubeConfig | null {
    // Try JSON first
    try {
      return JSON.parse(content) as KubeConfig;
    } catch {
      // Not JSON, try simple YAML parsing
    }

    try {
      return this.parseYamlLike(content);
    } catch {
      return null;
    }
  }

  /**
   * Parse a subset of YAML sufficient for kubeconfig files.
   * Handles nested objects and arrays (indicated by "- " prefix).
   */
  private parseYamlLike(content: string): KubeConfig | null {
    const lines = content.split('\n');
    const result: Record<string, unknown> = {};
    const stack: Array<{ indent: number; obj: Record<string, unknown> | unknown[]; key?: string }> = [
      { indent: -1, obj: result },
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip comments and empty lines
      if (!line.trim() || line.trim().startsWith('#')) continue;

      const indent = line.search(/\S/);
      const trimmed = line.trim();

      // Pop stack to find parent at correct indentation
      while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
        stack.pop();
      }

      const parent = stack[stack.length - 1];

      // Array item
      if (trimmed.startsWith('- ')) {
        const itemContent = trimmed.substring(2);
        const parentObj = parent.obj;

        if (Array.isArray(parentObj)) {
          if (itemContent.includes(':')) {
            const obj: Record<string, unknown> = {};
            const [key, ...valueParts] = itemContent.split(':');
            const value = valueParts.join(':').trim();
            obj[key.trim()] = this.parseYamlValue(value);
            parentObj.push(obj);
            stack.push({ indent, obj });
          } else {
            parentObj.push(this.parseYamlValue(itemContent));
          }
        }
        continue;
      }

      // Key-value pair
      if (trimmed.includes(':')) {
        const colonIndex = trimmed.indexOf(':');
        const key = trimmed.substring(0, colonIndex).trim();
        const value = trimmed.substring(colonIndex + 1).trim();

        if (!value) {
          // This key starts a nested object or array.
          // Peek at next non-empty line to determine which.
          let nextIndent = -1;
          let nextLine = '';
          for (let j = i + 1; j < lines.length; j++) {
            if (lines[j].trim() && !lines[j].trim().startsWith('#')) {
              nextIndent = lines[j].search(/\S/);
              nextLine = lines[j].trim();
              break;
            }
          }

          if (nextLine.startsWith('- ')) {
            const arr: unknown[] = [];
            if (!Array.isArray(parent.obj)) {
              (parent.obj as Record<string, unknown>)[key] = arr;
            }
            stack.push({ indent: nextIndent > indent ? indent : indent, obj: arr, key });
          } else {
            const obj: Record<string, unknown> = {};
            if (!Array.isArray(parent.obj)) {
              (parent.obj as Record<string, unknown>)[key] = obj;
            } else {
              // Part of an array item's nested object
              const lastItem = parent.obj[parent.obj.length - 1];
              if (typeof lastItem === 'object' && lastItem !== null) {
                (lastItem as Record<string, unknown>)[key] = obj;
              }
            }
            stack.push({ indent, obj });
          }
        } else {
          // Simple key: value
          if (!Array.isArray(parent.obj)) {
            (parent.obj as Record<string, unknown>)[key] = this.parseYamlValue(value);
          } else if (parent.obj.length > 0) {
            const lastItem = parent.obj[parent.obj.length - 1];
            if (typeof lastItem === 'object' && lastItem !== null) {
              (lastItem as Record<string, unknown>)[key] = this.parseYamlValue(value);
            }
          }
        }
      }
    }

    return result as unknown as KubeConfig;
  }

  /**
   * Parse a YAML scalar value.
   */
  private parseYamlValue(value: string): string | number | boolean | null {
    if (!value || value === '~' || value === 'null') return null;
    if (value === 'true') return true;
    if (value === 'false') return false;
    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1);
    }
    const num = Number(value);
    if (!isNaN(num) && value.length > 0) return num;
    return value;
  }

  /**
   * Check if the Kubernetes API server is reachable.
   */
  async isAvailable(): Promise<boolean> {
    if (!this.apiServer) {
      return false;
    }

    try {
      const response = await this.request('/api');
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Return the cluster name (from kubeconfig context or "in-cluster").
   */
  getClusterName(): string | undefined {
    return this.clusterName;
  }

  /**
   * Return the default namespace (from in-cluster SA or kubeconfig context).
   */
  getDefaultNamespace(): string | undefined {
    return this.defaultNamespace;
  }

  /**
   * List unique container images from pods, optionally filtered by namespace.
   * Deduplicates by image reference, tracking which pods use each image.
   */
  async listImages(namespace?: string): Promise<KubeImage[]> {
    const apiPath = namespace
      ? `/api/v1/namespaces/${encodeURIComponent(namespace)}/pods`
      : '/api/v1/pods';

    const response = await this.request(apiPath);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to list pods: ${response.status} ${text}`);
    }

    const podList: KubePodList = await response.json();
    return this.extractImages(podList.items);
  }

  /**
   * List all namespaces in the cluster.
   */
  async listNamespaces(): Promise<string[]> {
    const response = await this.request('/api/v1/namespaces');

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to list namespaces: ${response.status} ${text}`);
    }

    const nsList: KubeNamespaceList = await response.json();
    return nsList.items.map((ns) => ns.metadata.name).sort();
  }

  /**
   * Extract and deduplicate images from a list of pods.
   */
  private extractImages(pods: KubePod[]): KubeImage[] {
    // Key: "namespace/image" for deduplication
    const imageMap = new Map<
      string,
      {
        image: string;
        name: string;
        tag: string;
        pods: Set<string>;
        namespace: string;
        running: boolean;
      }
    >();

    for (const pod of pods) {
      const podName = pod.metadata.name;
      const podNamespace = pod.metadata.namespace;
      const isRunning = pod.status.phase === 'Running';

      const allContainers = [
        ...(pod.spec.containers || []),
        ...(pod.spec.initContainers || []),
      ];

      const allStatuses = [
        ...(pod.status.containerStatuses || []),
        ...(pod.status.initContainerStatuses || []),
      ];

      for (const container of allContainers) {
        const imageRef = container.image;
        if (!imageRef) continue;

        const { name, tag } = this.parseImageRef(imageRef);
        const mapKey = `${podNamespace}/${imageRef}`;

        const existing = imageMap.get(mapKey);

        // Check if this specific container is running
        const containerStatus = allStatuses.find((s) => s.name === container.name);
        const containerRunning = isRunning && !!containerStatus?.state?.running;

        if (existing) {
          existing.pods.add(podName);
          // Mark as running if any pod has it running
          if (containerRunning) {
            existing.running = true;
          }
        } else {
          imageMap.set(mapKey, {
            image: imageRef,
            name,
            tag,
            pods: new Set([podName]),
            namespace: podNamespace,
            running: containerRunning,
          });
        }
      }
    }

    return Array.from(imageMap.values()).map((entry) => ({
      image: entry.image,
      name: entry.name,
      tag: entry.tag,
      pods: Array.from(entry.pods),
      namespace: entry.namespace,
      running: entry.running,
    }));
  }

  /**
   * Parse an image reference into name and tag.
   * Handles formats like:
   *   nginx
   *   nginx:1.25
   *   registry.example.com/org/image:tag
   *   registry.example.com/org/image@sha256:abc...
   */
  private parseImageRef(imageRef: string): { name: string; tag: string } {
    // Handle digest references
    const digestIndex = imageRef.indexOf('@');
    if (digestIndex > 0) {
      return {
        name: imageRef.substring(0, digestIndex),
        tag: imageRef.substring(digestIndex + 1),
      };
    }

    // Handle tag references
    const lastColon = imageRef.lastIndexOf(':');
    if (lastColon > 0) {
      const afterColon = imageRef.substring(lastColon + 1);
      // Make sure the colon is not part of a port (e.g., registry:5000/image)
      if (!afterColon.includes('/')) {
        return {
          name: imageRef.substring(0, lastColon),
          tag: afterColon,
        };
      }
    }

    return { name: imageRef, tag: 'latest' };
  }

  /**
   * Make an authenticated request to the Kubernetes API server.
   */
  private async request(apiPath: string): Promise<Response> {
    const url = `${this.apiServer}${apiPath}`;

    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const fetchOptions: RequestInit = {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(10000),
    };

    // When using in-cluster CA, we need to tell Node to trust it.
    // Node.js fetch doesn't support per-request CA certs directly,
    // so for self-signed certs in-cluster we rely on
    // NODE_EXTRA_CA_CERTS or NODE_TLS_REJECT_UNAUTHORIZED being set.
    // For production, NODE_EXTRA_CA_CERTS should point to the CA bundle.

    return fetch(url, fetchOptions);
  }
}
