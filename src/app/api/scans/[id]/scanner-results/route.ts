import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { serializeForJson } from '@/lib/utils/type-utils'
import { apiError } from '@/lib/api/api-utils'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: scanId } = await params;

    // Fetch only the scanner results for a specific scan
    const scanMetadata = await prisma.scanMetadata.findFirst({
      where: {
        scan: {
          id: scanId
        }
      },
      select: {
        id: true,
        trivyResults: true,
        grypeResults: true,
        syftResults: true,
        diveResults: true,
        osvResults: true,
        dockleResults: true,
        scannerVersions: true,
        // Include some context
        vulnerabilityCritical: true,
        vulnerabilityHigh: true,
        vulnerabilityMedium: true,
        vulnerabilityLow: true,
        vulnerabilityInfo: true,
        complianceGrade: true,
        complianceScore: true,
      }
    });

    if (!scanMetadata) {
      return NextResponse.json(
        { error: 'Scan metadata not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(serializeForJson(scanMetadata));
  } catch (error) {
    return apiError(error, 'Error retrieving scanner results');
  }
}