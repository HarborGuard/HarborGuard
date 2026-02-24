import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiError } from '@/lib/api-utils';

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
      
      // Batch-fetch all findings for correlated CVEs in a single query
      const allCveIds = correlations.map(c => c.correlationKey);
      const allFindings = await prisma.scanVulnerabilityFinding.findMany({
        where: { scanId: id, cveId: { in: allCveIds } },
        select: {
          cveId: true,
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

      // Group findings in memory by cveId
      const findingsByCve = new Map<string, typeof allFindings>();
      allFindings.forEach(f => {
        if (!findingsByCve.has(f.cveId)) findingsByCve.set(f.cveId, []);
        findingsByCve.get(f.cveId)!.push(f);
      });

      const groupedFindings = correlations.map((corr) => ({
        cveId: corr.correlationKey,
        sources: corr.sources,
        sourceCount: corr.sourceCount,
        confidenceScore: corr.confidenceScore,
        severity: corr.severity,
        findings: findingsByCve.get(corr.correlationKey) || []
      }));
      
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
    return apiError(error, 'Failed to fetch vulnerability findings');
  }
}