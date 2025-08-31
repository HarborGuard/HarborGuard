import { createSwaggerSpec } from 'next-swagger-doc';
import path from 'path';

const apiDocumentation = createSwaggerSpec({
  apiFolder: path.join(process.cwd(), 'src/app/api'),
  definition: {
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
        url: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000',
        description: 'API Server',
      },
    ],
    tags: [
      { name: 'Health', description: 'Health check endpoints' },
      { name: 'Scans', description: 'Container scanning operations' },
      { name: 'Images', description: 'Container image management' },
      { name: 'Repositories', description: 'Repository management' },
      { name: 'Vulnerabilities', description: 'Vulnerability information' },
      { name: 'Docker', description: 'Docker operations' },
      { name: 'Audit', description: 'Audit logging' },
    ],
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
        ScanRequest: {
          type: 'object',
          required: ['imageName'],
          properties: {
            imageName: {
              type: 'string',
              description: 'Full image name with tag',
              example: 'nginx:latest',
            },
            scanners: {
              type: 'array',
              items: {
                type: 'string',
                enum: ['trivy', 'grype', 'syft', 'osv-scanner', 'dive', 'dockle'],
              },
              description: 'List of scanners to use',
            },
            isLocal: {
              type: 'boolean',
              description: 'Whether the image is local',
              default: false,
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
            credentials: {
              type: 'object',
              properties: {
                username: { type: 'string' },
                password: { type: 'string' },
                token: { type: 'string' },
              },
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
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT authorization (if enabled)',
        },
      },
    },
  },
});

export default apiDocumentation;