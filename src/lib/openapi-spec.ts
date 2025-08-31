export const openApiSpec = {
  openapi: '3.0.0',
  info: {
    title: 'HarborGuard API',
    version: '0.1b',
    description: 'HarborGuard Container Security Platform API Documentation',
    contact: {
      name: 'HarborGuard Team',
      url: 'https://github.com/HarborGuard/HarborGuard',
    }
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
  tags: [
    { name: 'Health', description: 'Health check endpoints' }
  ],
  paths: {
    '/api/health': {
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
      head: {
        summary: 'Lightweight health check',
        description: 'Quick health check for load balancers',
        tags: ['Health'],
        responses: {
          '200': {
            description: 'System is healthy',
          },
          '404': {
            description: 'Health checks are disabled',
          },
          '503': {
            description: 'System is unhealthy',
          },
        },
      },
    },
    '/api/ready': {
      get: {
        summary: 'Readiness check',
        description: 'Kubernetes readiness probe endpoint',
        tags: ['Health'],
        responses: {
          '200': {
            description: 'Service is ready',
          },
          '503': {
            description: 'Service is not ready',
          },
        },
      },
    },
    '/api/version': {
      get: {
        summary: 'Get version information',
        description: 'Returns current version and build information',
        tags: ['Health'],
        responses: {
          '200': {
            description: 'Version information',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    version: { type: 'string' },
                    buildDate: { type: 'string' },
                    gitCommit: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/scans/start': {
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
    },
    '/api/scans/status/{requestId}': {
      get: {
        summary: 'Get scan status',
        description: 'Check the status of a running or completed scan',
        tags: ['Scans'],
        parameters: [
          {
            name: 'requestId',
            in: 'path',
            required: true,
            description: 'Scan request ID',
            schema: {
              type: 'string',
            },
          },
        ],
        responses: {
          '200': {
            description: 'Scan status retrieved',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/ScanStatus',
                },
              },
            },
          },
          '404': {
            description: 'Scan not found',
          },
        },
      },
    },
    '/api/scans/cancel/{requestId}': {
      post: {
        summary: 'Cancel a scan',
        description: 'Cancel a running scan',
        tags: ['Scans'],
        parameters: [
          {
            name: 'requestId',
            in: 'path',
            required: true,
            description: 'Scan request ID',
            schema: {
              type: 'string',
            },
          },
        ],
        responses: {
          '200': {
            description: 'Scan cancelled',
          },
          '404': {
            description: 'Scan not found',
          },
        },
      },
    },
    '/api/scans/bulk': {
      post: {
        summary: 'Start bulk scan',
        description: 'Scan multiple images in a single request',
        tags: ['Scans'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  images: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        image: { type: 'string' },
                        tag: { type: 'string' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Bulk scan started',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    batchId: { type: 'string' },
                    totalImages: { type: 'number' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/images': {
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
    },
    '/api/images/{id}': {
      get: {
        summary: 'Get image details',
        description: 'Get detailed information about a specific image',
        tags: ['Images'],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'Image ID',
            schema: {
              type: 'string',
            },
          },
        ],
        responses: {
          '200': {
            description: 'Image details',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Image',
                },
              },
            },
          },
          '404': {
            description: 'Image not found',
          },
        },
      },
      delete: {
        summary: 'Delete an image',
        description: 'Delete an image and its scan history',
        tags: ['Images'],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'Image ID',
            schema: {
              type: 'string',
            },
          },
        ],
        responses: {
          '200': {
            description: 'Image deleted',
          },
          '404': {
            description: 'Image not found',
          },
        },
      },
    },
    '/api/repositories': {
      get: {
        summary: 'List repositories',
        description: 'Get all configured repositories',
        tags: ['Repositories'],
        responses: {
          '200': {
            description: 'List of repositories',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    $ref: '#/components/schemas/Repository',
                  },
                },
              },
            },
          },
        },
      },
      post: {
        summary: 'Add repository',
        description: 'Add a new repository configuration',
        tags: ['Repositories'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/Repository',
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Repository created',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Repository',
                },
              },
            },
          },
        },
      },
    },
    '/api/vulnerabilities': {
      get: {
        summary: 'List vulnerabilities',
        description: 'Get vulnerability statistics and details',
        tags: ['Vulnerabilities'],
        parameters: [
          {
            name: 'severity',
            in: 'query',
            schema: {
              type: 'string',
              enum: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'NEGLIGIBLE'],
            },
            description: 'Filter by severity',
          },
        ],
        responses: {
          '200': {
            description: 'Vulnerability list',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    $ref: '#/components/schemas/Vulnerability',
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/docker/images': {
      get: {
        summary: 'List local Docker images',
        description: 'Get list of images from local Docker daemon',
        tags: ['Docker'],
        responses: {
          '200': {
            description: 'List of Docker images',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      repoTags: {
                        type: 'array',
                        items: { type: 'string' },
                      },
                      size: { type: 'number' },
                      created: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/audit-logs': {
      get: {
        summary: 'Get audit logs',
        description: 'Retrieve system audit logs',
        tags: ['Audit'],
        parameters: [
          {
            name: 'limit',
            in: 'query',
            schema: {
              type: 'integer',
              default: 100,
            },
          },
          {
            name: 'offset',
            in: 'query',
            schema: {
              type: 'integer',
              default: 0,
            },
          },
        ],
        responses: {
          '200': {
            description: 'Audit logs',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    logs: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          timestamp: { type: 'string' },
                          action: { type: 'string' },
                          details: { type: 'object' },
                        },
                      },
                    },
                    total: { type: 'integer' },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
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