import { exec } from 'child_process';
import { promisify } from 'util';
import type { SwarmService, SwarmInfo } from '@/types';

const execAsync = promisify(exec);

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
  error?: string;
}

/**
 * Check if Docker socket is accessible and Docker daemon is running
 */
export async function checkDockerAccess(): Promise<DockerInfo> {
  try {
    const { stdout } = await execAsync('docker version --format "{{.Client.Version}}"', {
      timeout: 5000
    });
    
    return {
      hasAccess: true,
      version: stdout.trim()
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      hasAccess: false,
      error: errorMessage
    };
  }
}

/**
 * List all Docker images available locally
 */
export async function listDockerImages(): Promise<DockerImage[]> {
  try {
    const { stdout } = await execAsync(
      'docker images --format "{{.ID}}\t{{.Repository}}\t{{.Tag}}\t{{.Digest}}\t{{.Size}}\t{{.CreatedAt}}"',
      { timeout: 10000 }
    );

    const lines = stdout.trim().split('\n').filter(line => line.length > 0);
    
    return lines.map(line => {
      const [id, repository, tag, digest, size, created] = line.split('\t');
      return {
        id: id.substring(0, 12), // Short ID
        repository: repository || '<none>',
        tag: tag || '<none>',
        digest: digest || '<none>',
        size,
        created,
        fullName: repository === '<none>' || tag === '<none>' 
          ? id 
          : `${repository}:${tag}`
      };
    }).filter(image => 
      // Filter out <none> images and dangling images
      image.repository !== '<none>' && image.tag !== '<none>'
    );
  } catch (error) {
    console.error('Failed to list Docker images:', error);
    throw new Error(`Failed to list Docker images: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Get detailed information about a specific Docker image
 */
export async function inspectDockerImage(imageName: string): Promise<any> {
  try {
    const { stdout } = await execAsync(
      `docker inspect "${imageName}"`,
      { timeout: 10000 }
    );

    const imageData = JSON.parse(stdout);
    return imageData[0]; // docker inspect returns an array
  } catch (error) {
    console.error(`Failed to inspect Docker image ${imageName}:`, error);
    throw new Error(`Failed to inspect Docker image: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Check if Docker is running in Swarm mode and get cluster info
 */
export async function getSwarmInfo(): Promise<SwarmInfo> {
  try {
    const { stdout } = await execAsync(
      'docker info --format "{{.Swarm.LocalNodeState}}\t{{.Swarm.NodeID}}\t{{.Swarm.ControlAvailable}}\t{{.Swarm.Nodes}}\t{{.Swarm.Managers}}"',
      { timeout: 5000 }
    );

    const [state, nodeId, isManager, nodes, managers] = stdout.trim().split('\t');

    return {
      active: state === 'active',
      nodeId: nodeId || undefined,
      isManager: isManager === 'true',
      nodes: parseInt(nodes) || 0,
      managers: parseInt(managers) || 0,
    };
  } catch (error) {
    console.error('Failed to get Swarm info:', error);
    return { active: false };
  }
}

/**
 * List all services in the Swarm cluster
 */
export async function listSwarmServices(): Promise<SwarmService[]> {
  try {
    const { stdout } = await execAsync(
      `docker service ls --format '{{json .}}'`,
      { timeout: 10000 }
    );

    const lines = stdout.trim().split('\n').filter(line => line.length > 0);
    const services: SwarmService[] = [];

    for (const line of lines) {
      const svc = JSON.parse(line);

      // Get detailed service info
      const { stdout: detailStdout } = await execAsync(
        `docker service inspect ${svc.ID} --format '{{json .}}'`,
        { timeout: 5000 }
      );
      const detail = JSON.parse(detailStdout);

      // Parse image name and tag
      const fullImage = detail.Spec?.TaskTemplate?.ContainerSpec?.Image || svc.Image;
      const imageWithoutDigest = fullImage.split('@')[0];
      const lastColonIndex = imageWithoutDigest.lastIndexOf(':');
      let image: string;
      let tag: string;

      if (lastColonIndex > 0 && !imageWithoutDigest.substring(lastColonIndex).includes('/')) {
        image = imageWithoutDigest.substring(0, lastColonIndex);
        tag = imageWithoutDigest.substring(lastColonIndex + 1);
      } else {
        image = imageWithoutDigest;
        tag = 'latest';
      }

      // Parse replicas
      const [running, desired] = (svc.Replicas || '0/0').split('/').map(Number);

      // Parse ports
      const ports = (detail.Endpoint?.Ports || []).map((p: any) => ({
        published: p.PublishedPort,
        target: p.TargetPort,
        protocol: p.Protocol,
      }));

      services.push({
        id: svc.ID,
        name: svc.Name,
        image,
        imageTag: tag,
        replicas: { running, desired },
        mode: svc.Mode === 'global' ? 'global' : 'replicated',
        ports,
        createdAt: detail.CreatedAt,
        updatedAt: detail.UpdatedAt,
      });
    }

    return services;
  } catch (error) {
    console.error('Failed to list Swarm services:', error);
    throw new Error(`Failed to list Swarm services: ${error instanceof Error ? error.message : String(error)}`);
  }
}