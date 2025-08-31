import { generateOpenApiPaths } from './api-scanner';
import path from 'path';

/**
 * Dynamically generate OpenAPI specification by scanning API routes
 */
export function generateDynamicOpenApiSpec() {
  const apiDir = path.join(process.cwd(), 'src', 'app', 'api');
  const dynamicPaths = generateOpenApiPaths(apiDir);
  
  // Merge with manual overrides for well-documented endpoints
  const enhancedPaths = { ...dynamicPaths };
  
  // Override with detailed documentation for key endpoints
  if (enhancedPaths['/api/health']) {
    enhancedPaths['/api/health'] = {
      ...enhancedPaths['/api/health'],
      get: {
        summary: 'Health check endpoint',
        description: 'Returns system health status and configuration details',
        tags: ['Health'],
        responses: {
          '200': {
            description: 'System is healthy or degraded but operational',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: {
                      type: 'string',
                      enum: ['healthy', 'unhealthy', 'degraded'],
                    },
                    timestamp: {
                      type: 'string',
                      format: 'date-time',
                    },
                    version: {
                      type: 'string',
                    },
                    uptime: {
                      type: 'number',
                    },
                    checks: {
                      type: 'object',
                    },
                  },
                },
              },
            },
          },
          '404': {
            description: 'Health checks are disabled',
          },
          '503': {
            description: 'System is unhealthy',
          },
        },
      },
    };
  }
  
  if (enhancedPaths['/api/scans/start']) {
    enhancedPaths['/api/scans/start'] = {
      post: {
        summary: 'Start a new container scan',
        description: 'Initiates a security scan for a container image',
        tags: ['Scans'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['image', 'tag'],
                properties: {
                  image: {
                    type: 'string',
                    description: 'Image name',
                    example: 'nginx',
                  },
                  tag: {
                    type: 'string',
                    description: 'Image tag',
                    example: 'latest',
                  },
                  source: {
                    type: 'string',
                    enum: ['registry', 'local'],
                    description: 'Image source',
                  },
                  dockerImageId: {
                    type: 'string',
                    description: 'Docker image ID for local images',
                  },
                  repositoryId: {
                    type: 'string',
                    description: 'Repository ID for private registries',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Scan started successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    requestId: {
                      type: 'string',
                      description: 'Unique scan request ID',
                    },
                    message: {
                      type: 'string',
                    },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Invalid request data',
          },
          '500': {
            description: 'Internal server error',
          },
        },
      },
    };
  }
  
  if (enhancedPaths['/api/images']) {
    enhancedPaths['/api/images'] = {
      get: {
        summary: 'List container images',
        description: 'Retrieve a paginated list of scanned container images',
        tags: ['Images'],
        parameters: [
          {
            name: 'limit',
            in: 'query',
            schema: {
              type: 'integer',
              default: 25,
            },
            description: 'Number of images to return',
          },
          {
            name: 'offset',
            in: 'query',
            schema: {
              type: 'integer',
              default: 0,
            },
            description: 'Number of images to skip',
          },
          {
            name: 'includeScans',
            in: 'query',
            schema: {
              type: 'boolean',
              default: false,
            },
            description: 'Include scan history',
          },
          {
            name: 'includeVulnerabilities',
            in: 'query',
            schema: {
              type: 'boolean',
              default: false,
            },
            description: 'Include vulnerability details',
          },
        ],
        responses: {
          '200': {
            description: 'List of images retrieved successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    images: {
                      type: 'array',
                      items: {
                        $ref: '#/components/schemas/Image',
                      },
                    },
                    pagination: {
                      type: 'object',
                      properties: {
                        total: { type: 'integer' },
                        limit: { type: 'integer' },
                        offset: { type: 'integer' },
                        hasMore: { type: 'boolean' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };
  }
  
  // Extract all unique tags from the paths and create tag objects dynamically
  const tagMap = new Map<string, { name: string, description: string }>();
  
  Object.values(enhancedPaths).forEach((pathMethods: any) => {
    Object.values(pathMethods).forEach((method: any) => {
      if (method.tags && Array.isArray(method.tags)) {
        method.tags.forEach((tag: string) => {
          if (!tagMap.has(tag)) {
            // Generate description based on tag name
            let description = `${tag} operations`;
            
            // Special cases for better descriptions
            const descriptionMap: Record<string, string> = {
              'Health': 'Health check and status endpoints',
              'Scans': 'Container scanning operations',
              'Images': 'Container image management',
              'Image': 'Individual image operations',
              'Repositories': 'Repository management and configuration',
              'Vulnerabilities': 'Vulnerability information and analysis',
              'Docker': 'Docker daemon and local image operations',
              'Audit Logs': 'Audit logging and history',
              'Scanners': 'Scanner configuration and availability',
              'Version': 'Version and build information',
              'Ready': 'Readiness probe endpoints',
            };
            
            if (descriptionMap[tag]) {
              description = descriptionMap[tag];
            }
            
            tagMap.set(tag, {
              name: tag,
              description
            });
          }
        });
      }
    });
  });
  
  // Convert map to sorted array
  const activeTags = Array.from(tagMap.values()).sort((a, b) => 
    a.name.localeCompare(b.name)
  );
  
  return {
    openapi: '3.0.0',
    info: {
      title: 'HarborGuard API',
      version: '0.1b',
      description: 'HarborGuard Container Security Platform API Documentation',
      contact: {
        name: 'HarborGuard Team',
        url: 'https://github.com/HarborGuard/HarborGuard',
      },
      license: {
        name: 'MIT',
        url: 'https://github.com/HarborGuard/HarborGuard/blob/main/LICENSE',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development Server',
      },
      ...(process.env.NEXT_PUBLIC_API_URL ? [{
        url: process.env.NEXT_PUBLIC_API_URL,
        description: 'Production Server',
      }] : []),
    ],
    tags: activeTags,
    paths: enhancedPaths,
    components: {
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              description: 'Error message',
            },
            details: {
              type: 'string',
              description: 'Additional error details',
            },
          },
        },
        ScanStatus: {
          type: 'object',
          properties: {
            requestId: {
              type: 'string',
              description: 'Unique scan request ID',
            },
            status: {
              type: 'string',
              enum: ['pending', 'processing', 'completed', 'error', 'cancelled'],
              description: 'Current scan status',
            },
            progress: {
              type: 'object',
              properties: {
                current: {
                  type: 'number',
                  description: 'Current step',
                },
                total: {
                  type: 'number',
                  description: 'Total steps',
                },
                percentage: {
                  type: 'number',
                  description: 'Progress percentage',
                },
              },
            },
            results: {
              type: 'object',
              description: 'Scan results when completed',
            },
            error: {
              type: 'string',
              description: 'Error message if failed',
            },
          },
        },
        Image: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Image ID',
            },
            name: {
              type: 'string',
              description: 'Image name',
            },
            tag: {
              type: 'string',
              description: 'Image tag',
            },
            repository: {
              type: 'string',
              description: 'Repository name',
            },
            riskScore: {
              type: 'number',
              description: 'Risk score (0-100)',
            },
            vulnerabilities: {
              type: 'object',
              properties: {
                critical: { type: 'number' },
                high: { type: 'number' },
                medium: { type: 'number' },
                low: { type: 'number' },
                negligible: { type: 'number' },
              },
            },
            lastScanned: {
              type: 'string',
              format: 'date-time',
              description: 'Last scan timestamp',
            },
          },
        },
        Repository: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Repository ID',
            },
            name: {
              type: 'string',
              description: 'Repository name',
            },
            type: {
              type: 'string',
              enum: ['dockerhub', 'ghcr', 'ecr', 'gcr', 'acr', 'harbor', 'quay', 'custom'],
              description: 'Repository type',
            },
            url: {
              type: 'string',
              description: 'Repository URL',
            },
            isPublic: {
              type: 'boolean',
              description: 'Whether repository is public',
            },
          },
        },
        Vulnerability: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Vulnerability ID (CVE)',
            },
            severity: {
              type: 'string',
              enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'NEGLIGIBLE'],
              description: 'Vulnerability severity',
            },
            title: {
              type: 'string',
              description: 'Vulnerability title',
            },
            description: {
              type: 'string',
              description: 'Vulnerability description',
            },
            cvss: {
              type: 'object',
              properties: {
                score: { type: 'number' },
                vector: { type: 'string' },
              },
            },
            fixedVersion: {
              type: 'string',
              description: 'Version with fix',
            },
            installedVersion: {
              type: 'string',
              description: 'Currently installed version',
            },
            packageName: {
              type: 'string',
              description: 'Affected package name',
            },
          },
        },
      },
    },
  };
}

// Cache for production
let cachedSpec: any = null;

/**
 * Get OpenAPI specification with caching in production
 */
export function getOpenApiSpec() {
  // In development, always generate fresh
  if (process.env.NODE_ENV === 'development') {
    return generateDynamicOpenApiSpec();
  }
  
  // In production, cache the result
  if (!cachedSpec) {
    cachedSpec = generateDynamicOpenApiSpec();
  }
  
  return cachedSpec;
}