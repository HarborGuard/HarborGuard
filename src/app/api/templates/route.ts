import { NextRequest, NextResponse } from 'next/server';
import { scanTemplateService } from '@/lib/templates/ScanTemplateService';
import { z } from 'zod';

const CreateTemplateSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  environment: z.enum(['production', 'staging', 'development', 'any']),
  scannerConfig: z.object({
    scanners: z.array(z.enum(['trivy', 'grype', 'syft', 'osv', 'dockle', 'dive'])).min(1),
    failOnHigh: z.boolean().optional(),
    timeout: z.number().min(30000).optional(),
    cacheEnabled: z.boolean().optional(),
    parallelScans: z.boolean().optional(),
    customArgs: z.record(z.string(), z.array(z.string())).optional(),
  }),
  policyConfig: z.object({
    maxCritical: z.number().min(0),
    maxHigh: z.number().min(0),
    maxMedium: z.number().min(0).optional(),
    complianceRequired: z.boolean(),
    generateReport: z.boolean().optional(),
    allowedLicenses: z.array(z.string()).optional(),
    blockedPackages: z.array(z.string()).optional(),
  }).optional(),
  notificationConfig: z.object({
    channels: z.array(z.enum(['slack', 'email', 'webhook'])),
    recipients: z.array(z.string()),
    onFailure: z.boolean(),
    onThresholdExceeded: z.boolean(),
    onCompletion: z.boolean().optional(),
    customMessage: z.string().optional(),
  }).optional(),
  isDefault: z.boolean().optional(),
  createdBy: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Validate request body
    const validatedData = CreateTemplateSchema.parse(body);
    
    const template = await scanTemplateService.createTemplate(validatedData);
    
    return NextResponse.json({
      success: true,
      data: template
    }, { status: 201 });
    
  } catch (error) {
    console.error('Failed to create template:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: 'Invalid request data',
        details: error.issues
      }, { status: 400 });
    }
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create template'
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const environment = searchParams.get('environment');
    
    let templates;
    if (environment) {
      templates = await scanTemplateService.getTemplatesByEnvironment(environment);
    } else {
      templates = await scanTemplateService.getTemplates();
    }
    
    return NextResponse.json({
      success: true,
      data: templates
    });
    
  } catch (error) {
    console.error('Failed to get templates:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get templates'
    }, { status: 500 });
  }
}