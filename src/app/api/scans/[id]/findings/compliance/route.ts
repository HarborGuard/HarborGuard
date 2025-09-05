import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    
    const source = searchParams.get('source'); // Filter by scanner
    const severity = searchParams.get('severity'); // Filter by severity
    const category = searchParams.get('category'); // Filter by category
    
    const where: any = { scanId: id };
    if (source) where.source = source;
    if (severity) where.severity = severity.toUpperCase();
    if (category) where.category = category;
    
    const findings = await prisma.scanComplianceFinding.findMany({
      where,
      orderBy: [
        { severity: 'desc' },
        { category: 'asc' },
        { ruleId: 'asc' }
      ]
    });
    
    // Count by severity
    const severityCounts = await prisma.scanComplianceFinding.groupBy({
      by: ['severity'],
      where: { scanId: id },
      _count: true
    });
    
    // Count by category
    const categoryCounts = await prisma.scanComplianceFinding.groupBy({
      by: ['category'],
      where: { scanId: id },
      _count: true
    });
    
    // Calculate compliance score
    const total = findings.length;
    const critical = findings.filter(f => f.severity === 'CRITICAL').length;
    const high = findings.filter(f => f.severity === 'HIGH').length;
    const medium = findings.filter(f => f.severity === 'MEDIUM').length;
    const low = findings.filter(f => f.severity === 'LOW').length;
    
    // Simple scoring: deduct points for violations
    const score = Math.max(0, 100 - (critical * 25) - (high * 10) - (medium * 5) - (low * 2));
    const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';
    
    return NextResponse.json({
      total,
      score,
      grade,
      severityCounts: severityCounts.map(s => ({ severity: s.severity, count: s._count })),
      categoryCounts: categoryCounts.map(c => ({ category: c.category, count: c._count })),
      findings
    });
  } catch (error) {
    console.error('Error fetching compliance findings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch compliance findings' },
      { status: 500 }
    );
  }
}