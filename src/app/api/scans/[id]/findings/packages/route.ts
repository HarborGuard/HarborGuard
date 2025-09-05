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
    const type = searchParams.get('type'); // Filter by package type
    const ecosystem = searchParams.get('ecosystem'); // Filter by ecosystem
    const search = searchParams.get('search'); // Search in package names
    
    const where: any = { scanId: id };
    if (source) where.source = source;
    if (type) where.type = type;
    if (ecosystem) where.ecosystem = ecosystem;
    if (search) where.packageName = { contains: search, mode: 'insensitive' };
    
    const findings = await prisma.scanPackageFinding.findMany({
      where,
      orderBy: [
        { packageName: 'asc' },
        { version: 'asc' }
      ]
    });
    
    // Get unique package count
    const uniquePackages = await prisma.scanPackageFinding.findMany({
      where: { scanId: id },
      distinct: ['packageName'],
      select: { packageName: true }
    });
    
    // Count by source
    const sourceCounts = await prisma.scanPackageFinding.groupBy({
      by: ['source'],
      where: { scanId: id },
      _count: true
    });
    
    // Count by type
    const typeCounts = await prisma.scanPackageFinding.groupBy({
      by: ['type'],
      where: { scanId: id },
      _count: true
    });
    
    // Count by ecosystem
    const ecosystemCounts = await prisma.scanPackageFinding.groupBy({
      by: ['ecosystem'],
      where: { scanId: id },
      _count: true
    });
    
    // License summary
    const licenseCounts = await prisma.scanPackageFinding.groupBy({
      by: ['license'],
      where: {
        scanId: id,
        license: { not: null }
      },
      _count: true,
      orderBy: { _count: { license: 'desc' } },
      take: 10
    });
    
    return NextResponse.json({
      total: findings.length,
      uniquePackages: uniquePackages.length,
      sourceCounts: sourceCounts.map(s => ({ source: s.source, count: s._count })),
      typeCounts: typeCounts.map(t => ({ type: t.type, count: t._count })),
      ecosystemCounts: ecosystemCounts.filter(e => e.ecosystem).map(e => ({ 
        ecosystem: e.ecosystem, 
        count: e._count 
      })),
      topLicenses: licenseCounts.map(l => ({ 
        license: l.license, 
        count: l._count 
      })),
      packages: findings
    });
  } catch (error) {
    console.error('Error fetching package findings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch package findings' },
      { status: 500 }
    );
  }
}