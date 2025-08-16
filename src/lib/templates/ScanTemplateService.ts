import { prisma } from '@/lib/prisma';
import type { ScanTemplate, CreateTemplateRequest, AppliedScanRequest } from './types';
import type { ScanRequest } from '@/types';

export class ScanTemplateService {
  async createTemplate(request: CreateTemplateRequest): Promise<ScanTemplate> {
    // Validate scanner configuration
    this.validateScannerConfig(request.scannerConfig);

    // If setting as default, unset other defaults for the same environment
    if (request.isDefault) {
      await prisma.scanTemplate.updateMany({
        where: {
          environment: request.environment,
          isDefault: true
        },
        data: { isDefault: false }
      });
    }

    const template = await prisma.scanTemplate.create({
      data: {
        name: request.name,
        description: request.description,
        environment: request.environment,
        scannerConfig: request.scannerConfig as any,
        policyConfig: request.policyConfig as any,
        notificationConfig: request.notificationConfig as any,
        isDefault: request.isDefault || false,
        createdBy: request.createdBy,
      }
    });

    return template as unknown as ScanTemplate;
  }

  async updateTemplate(id: string, updates: Partial<CreateTemplateRequest>): Promise<ScanTemplate> {
    const existingTemplate = await prisma.scanTemplate.findUnique({
      where: { id }
    });

    if (!existingTemplate) {
      throw new Error(`Template ${id} not found`);
    }

    // Validate scanner configuration if provided
    if (updates.scannerConfig) {
      this.validateScannerConfig(updates.scannerConfig);
    }

    // Handle default flag
    if (updates.isDefault && updates.environment) {
      await prisma.scanTemplate.updateMany({
        where: {
          environment: updates.environment,
          isDefault: true,
          id: { not: id }
        },
        data: { isDefault: false }
      });
    }

    const updated = await prisma.scanTemplate.update({
      where: { id },
      data: updates as any
    });

    return updated as unknown as ScanTemplate;
  }

  async deleteTemplate(id: string): Promise<void> {
    const template = await prisma.scanTemplate.findUnique({
      where: { id }
    });

    if (!template) {
      throw new Error(`Template ${id} not found`);
    }

    await prisma.scanTemplate.delete({
      where: { id }
    });
  }

  async getTemplate(id: string): Promise<ScanTemplate | null> {
    const template = await prisma.scanTemplate.findUnique({
      where: { id }
    });

    return template as unknown as ScanTemplate | null;
  }

  async getTemplates(): Promise<ScanTemplate[]> {
    const templates = await prisma.scanTemplate.findMany({
      orderBy: [
        { isDefault: 'desc' },
        { environment: 'asc' },
        { name: 'asc' }
      ]
    });

    return templates as unknown as ScanTemplate[];
  }

  async getTemplatesByEnvironment(environment: string): Promise<ScanTemplate[]> {
    const templates = await prisma.scanTemplate.findMany({
      where: {
        OR: [
          { environment },
          { environment: 'any' }
        ]
      },
      orderBy: [
        { isDefault: 'desc' },
        { name: 'asc' }
      ]
    });

    return templates as unknown as ScanTemplate[];
  }

  async getDefaultTemplate(environment: string): Promise<ScanTemplate | null> {
    const template = await prisma.scanTemplate.findFirst({
      where: {
        AND: [
          { isDefault: true },
          {
            OR: [
              { environment },
              { environment: 'any' }
            ]
          }
        ]
      },
      orderBy: [
        { environment: environment === 'any' ? 'desc' : 'asc' } // Prefer specific env over 'any'
      ]
    });

    return template as unknown as ScanTemplate | null;
  }

  async applyScanTemplate(
    request: ScanRequest, 
    templateId: string
  ): Promise<AppliedScanRequest> {
    const template = await this.getTemplate(templateId);

    if (!template) {
      throw new Error(`Scan template ${templateId} not found`);
    }

    return {
      ...request,
      template,
      scannerConfig: template.scannerConfig,
      policyConfig: template.policyConfig,
      notificationConfig: template.notificationConfig
    };
  }

  async applyScanTemplateByEnvironment(
    request: ScanRequest,
    environment: string
  ): Promise<AppliedScanRequest> {
    const template = await this.getDefaultTemplate(environment);

    if (!template) {
      // Return original request if no template found
      return request as AppliedScanRequest;
    }

    return this.applyScanTemplate(request, template.id);
  }

  async initializeDefaultTemplates(): Promise<void> {
    console.log('Initializing default scan templates...');

    const existingTemplates = await prisma.scanTemplate.count();
    if (existingTemplates > 0) {
      console.log('Default templates already exist, skipping initialization');
      return;
    }

    const defaultTemplates: CreateTemplateRequest[] = [
      {
        name: 'Production Comprehensive',
        description: 'Full security scan for production images with strict policies',
        environment: 'production',
        scannerConfig: {
          scanners: ['trivy', 'grype', 'syft', 'osv', 'dockle', 'dive'],
          failOnHigh: true,
          timeout: 600000, // 10 minutes
          cacheEnabled: true,
          parallelScans: false // Sequential for reliability
        },
        policyConfig: {
          maxCritical: 0,
          maxHigh: 5,
          maxMedium: 20,
          complianceRequired: true,
          generateReport: true,
          allowedLicenses: ['MIT', 'Apache-2.0', 'BSD-3-Clause', 'BSD-2-Clause', 'ISC'],
          blockedPackages: ['*debug*', '*test*']
        },
        notificationConfig: {
          channels: ['email', 'slack'],
          recipients: ['security@company.com'],
          onFailure: true,
          onThresholdExceeded: true,
          onCompletion: false
        },
        isDefault: true
      },
      {
        name: 'Staging Standard',
        description: 'Balanced security scan for staging environments',
        environment: 'staging',
        scannerConfig: {
          scanners: ['trivy', 'grype', 'dockle', 'syft'],
          failOnHigh: false,
          timeout: 300000, // 5 minutes
          cacheEnabled: true,
          parallelScans: true
        },
        policyConfig: {
          maxCritical: 2,
          maxHigh: 10,
          maxMedium: 50,
          complianceRequired: true,
          generateReport: false
        },
        notificationConfig: {
          channels: ['slack'],
          recipients: ['dev-team'],
          onFailure: true,
          onThresholdExceeded: false,
          onCompletion: false
        },
        isDefault: true
      },
      {
        name: 'Development Quick',
        description: 'Fast scan for development images with relaxed policies',
        environment: 'development',
        scannerConfig: {
          scanners: ['trivy', 'dockle'],
          failOnHigh: false,
          timeout: 180000, // 3 minutes
          cacheEnabled: true,
          parallelScans: true
        },
        policyConfig: {
          maxCritical: 10,
          maxHigh: 50,
          maxMedium: 100,
          complianceRequired: false,
          generateReport: false
        },
        isDefault: true
      },
      {
        name: 'Compliance Focus',
        description: 'Configuration and compliance-focused scan',
        environment: 'any',
        scannerConfig: {
          scanners: ['dockle', 'dive'],
          failOnHigh: false,
          timeout: 240000, // 4 minutes
          cacheEnabled: true,
          parallelScans: true
        },
        policyConfig: {
          maxCritical: 100, // Focus on compliance, not vulnerabilities
          maxHigh: 100,
          complianceRequired: true,
          generateReport: true
        },
        notificationConfig: {
          channels: ['email'],
          recipients: ['compliance@company.com'],
          onFailure: true,
          onThresholdExceeded: false,
          onCompletion: true
        },
        isDefault: false
      }
    ];

    for (const template of defaultTemplates) {
      try {
        await this.createTemplate({ ...template, createdBy: 'system' });
        console.log(`Created default template: ${template.name}`);
      } catch (error) {
        console.error(`Failed to create template ${template.name}:`, error);
      }
    }

    console.log('Default templates initialization completed');
  }

  private validateScannerConfig(config: any): void {
    const validScanners = ['trivy', 'grype', 'syft', 'osv', 'dockle', 'dive'];
    
    if (!Array.isArray(config.scanners) || config.scanners.length === 0) {
      throw new Error('Scanner configuration must specify at least one scanner');
    }

    const invalidScanners = config.scanners.filter(
      (scanner: string) => !validScanners.includes(scanner)
    );

    if (invalidScanners.length > 0) {
      throw new Error(`Invalid scanners: ${invalidScanners.join(', ')}. Valid scanners are: ${validScanners.join(', ')}`);
    }

    if (config.timeout && (typeof config.timeout !== 'number' || config.timeout < 30000)) {
      throw new Error('Timeout must be a number >= 30000 (30 seconds)');
    }
  }

  async getTemplateUsageStats() {
    // This would track how often templates are used
    // For now, return basic template info
    const templates = await this.getTemplates();
    
    return templates.map(template => ({
      id: template.id,
      name: template.name,
      environment: template.environment,
      isDefault: template.isDefault,
      scannerCount: template.scannerConfig.scanners?.length || 0,
      // TODO: Add actual usage statistics from scans
      usageCount: 0,
      lastUsed: null
    }));
  }
}

export const scanTemplateService = new ScanTemplateService();