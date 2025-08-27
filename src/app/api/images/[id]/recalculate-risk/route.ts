import { NextRequest, NextResponse } from 'next/server';
import { recalculateImageRiskScores } from '@/lib/scan-aggregations-server';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id: imageId } = await params;

    // Recalculate risk scores for all scans of this image
    await recalculateImageRiskScores(imageId);

    return NextResponse.json({ 
      success: true,
      message: 'Risk scores recalculated successfully' 
    });
  } catch (error) {
    console.error('Error recalculating risk scores:', error);
    return NextResponse.json(
      { error: 'Failed to recalculate risk scores' },
      { status: 500 }
    );
  }
}