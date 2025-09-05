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
    const packageName = searchParams.get('package'); // Filter by package
    const grouped = searchParams.get('grouped') === 'true'; // Group by CVE
    
    const where: any = { scanId: id };
    if (source) where.source = source;
    if (severity) where.severity = severity.toUpperCase();
    if (packageName) where.packageName = { contains: packageName };
    
    if (grouped) {
      // Get correlations for grouped view
      const correlations = await prisma.scanFindingCorrelation.findMany({
        where: {
          scanId: id,
          findingType: 'vulnerability'
        },
        orderBy: [
          { sourceCount: 'desc' },
          { severity: 'desc' },
          { correlationKey: 'asc' }
        ]
      });
      
      // Get detailed findings for each correlation
      const groupedFindings = await Promise.all(
        correlations.map(async (corr) => {
          const findings = await prisma.scanVulnerabilityFinding.findMany({
            where: {
              scanId: id,
              cveId: corr.correlationKey
            },
            select: {
              source: true,
              packageName: true,
              installedVersion: true,
              fixedVersion: true,
              severity: true,
              cvssScore: true,
              title: true,
              description: true,
              vulnerabilityUrl: true
            }
          });
          
          return {
            cveId: corr.correlationKey,
            sources: corr.sources,
            sourceCount: corr.sourceCount,
            confidenceScore: corr.confidenceScore,
            severity: corr.severity,
            findings
          };
        })
      );
      
      return NextResponse.json({
        total: correlations.length,
        grouped: true,
        vulnerabilities: groupedFindings
      });
    } else {
      // Get raw findings
      const findings = await prisma.scanVulnerabilityFinding.findMany({
        where,
        orderBy: [
          { severity: 'desc' },
          { cvssScore: 'desc' },
          { cveId: 'asc' }
        ]
      });
      
      // Count by source
      const sourceCounts = await prisma.scanVulnerabilityFinding.groupBy({
        by: ['source'],
        where: { scanId: id },
        _count: true
      });
      
      // Count by severity
      const severityCounts = await prisma.scanVulnerabilityFinding.groupBy({
        by: ['severity'],
        where: { scanId: id },
        _count: true
      });
      
      return NextResponse.json({
        total: findings.length,
        grouped: false,
        sourceCounts: sourceCounts.map(s => ({ source: s.source, count: s._count })),
        severityCounts: severityCounts.map(s => ({ severity: s.severity, count: s._count })),
        vulnerabilities: findings
      });
    }
  } catch (error) {
    console.error('Error fetching vulnerability findings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch vulnerability findings' },
      { status: 500 }
    );
  }
}