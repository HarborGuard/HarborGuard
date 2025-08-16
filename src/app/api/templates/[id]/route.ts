import { NextRequest, NextResponse } from 'next/server';
import { scanTemplateService } from '@/lib/templates/ScanTemplateService';
import { z } from 'zod';

const UpdateTemplateSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  environment: z.enum(['production', 'staging', 'development', 'any']).optional(),
  scannerConfig: z.object({
    scanners: z.array(z.enum(['trivy', 'grype', 'syft', 'osv', 'dockle', 'dive'])).min(1),
    failOnHigh: z.boolean().optional(),
    timeout: z.number().min(30000).optional(),
    cacheEnabled: z.boolean().optional(),
    parallelScans: z.boolean().optional(),
    customArgs: z.record(z.string(), z.array(z.string())).optional(),
  }).optional(),
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
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const template = await scanTemplateService.getTemplate(id);
    
    if (!template) {
      return NextResponse.json({
        success: false,
        error: 'Template not found'
      }, { status: 404 });
    }
    
    return NextResponse.json({
      success: true,
      data: template
    });
    
  } catch (error) {
    console.error('Failed to get template:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get template'
    }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    
    // Validate request body
    const validatedData = UpdateTemplateSchema.parse(body);
    
    const template = await scanTemplateService.updateTemplate(id, validatedData);
    
    return NextResponse.json({
      success: true,
      data: template
    });
    
  } catch (error) {
    console.error('Failed to update template:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        success: false,
        error: 'Invalid request data',
        details: error.issues
      }, { status: 400 });
    }
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update template'
    }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    await scanTemplateService.deleteTemplate(id);
    
    return NextResponse.json({
      success: true,
      message: 'Template deleted successfully'
    });
    
  } catch (error) {
    console.error('Failed to delete template:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete template'
    }, { status: 500 });
  }
}