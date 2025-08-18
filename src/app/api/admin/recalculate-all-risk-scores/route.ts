import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { recalculateImageRiskScores } from '@/lib/scan-aggregations';

export async function POST(request: NextRequest) {
  try {
    // Get all unique image IDs that have CVE classifications
    const imagesWithClassifications = await prisma.cveClassification.findMany({
      select: { imageId: true },
      distinct: ['imageId']
    });

    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    // Recalculate risk scores for each image
    for (const { imageId } of imagesWithClassifications) {
      try {
        await recalculateImageRiskScores(imageId);
        successCount++;
      } catch (error) {
        errorCount++;
        const errorMessage = `Failed to recalculate ${imageId}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        errors.push(errorMessage);
        console.error(errorMessage);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Risk score recalculation completed`,
      stats: {
        totalImages: imagesWithClassifications.length,
        successful: successCount,
        failed: errorCount
      },
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error in bulk risk score recalculation:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to recalculate risk scores',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}