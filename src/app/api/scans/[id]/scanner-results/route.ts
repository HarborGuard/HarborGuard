import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const scanId = params.id;

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

    // Serialize BigInt values
    const serialized = JSON.parse(JSON.stringify(scanMetadata, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    ));

    return NextResponse.json(serialized);
  } catch (error) {
    console.error('Error retrieving scanner results:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}