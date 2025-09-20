import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { serializeForJson } from '@/lib/type-utils';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: scanId } = await params;
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'all';
    const search = searchParams.get('search') || '';
    const severity = searchParams.get('severity') || '';
    const source = searchParams.get('source') || '';

    // Verify scan exists
    const scan = await prisma.scan.findUnique({
      where: { id: scanId },
      include: {
        image: true,
        metadata: true
      }
    });

    if (!scan) {
      return NextResponse.json({ error: 'Scan not found' }, { status: 404 });
    }

    const result: any = {
      scanId,
      image: scan.image,
      status: scan.status,
      startedAt: scan.startedAt,
      finishedAt: scan.finishedAt
    };

    // Build common where clause for filtering
    const buildWhereClause = (findingType: string, additionalFilters = {}) => {
      const where: any = { scanId, ...additionalFilters };
      
      if (source) {
        where.source = source;
      }
      
      if (search) {
        // Add search conditions based on finding type
        if (findingType === 'vulnerabilities') {
          where.OR = [
            { cveId: { contains: search, mode: 'insensitive' } },
            { packageName: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
            { title: { contains: search, mode: 'insensitive' } }
          ];
        } else if (findingType === 'packages') {
          where.OR = [
            { packageName: { contains: search, mode: 'insensitive' } },
            { version: { contains: search, mode: 'insensitive' } },
            { type: { contains: search, mode: 'insensitive' } }
          ];
        } else if (findingType === 'compliance') {
          where.OR = [
            { ruleName: { contains: search, mode: 'insensitive' } },
            { message: { contains: search, mode: 'insensitive' } },
            { category: { contains: search, mode: 'insensitive' } }
          ];
        }
      }
      
      // Only add severity filter for findings that have severity field
      if (severity && (findingType === 'vulnerabilities' || findingType === 'compliance')) {
        where.severity = severity.toUpperCase();
      }
      
      return where;
    };

    // Fetch vulnerabilities
    if (type === 'vulnerabilities' || type === 'all') {
      const vulnerabilities = await prisma.scanVulnerabilityFinding.findMany({
        where: buildWhereClause('vulnerabilities'),
        orderBy: [
          { severity: 'desc' },
          { cvssScore: 'desc' },
          { cveId: 'asc' }
        ]
      });

      // Group vulnerabilities by source for summary
      const vulnBySource: Record<string, any> = {};
      const vulnBySeverity: Record<string, number> = {
        CRITICAL: 0,
        HIGH: 0,
        MEDIUM: 0,
        LOW: 0,
        INFO: 0
      };

      vulnerabilities.forEach(vuln => {
        if (!vulnBySource[vuln.source]) {
          vulnBySource[vuln.source] = {
            source: vuln.source,
            count: 0,
            severities: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 }
          };
        }
        vulnBySource[vuln.source].count++;
        vulnBySource[vuln.source].severities[vuln.severity]++;
        vulnBySeverity[vuln.severity]++;
      });

      result.vulnerabilities = {
        total: vulnerabilities.length,
        bySeverity: vulnBySeverity,
        bySource: Object.values(vulnBySource),
        findings: vulnerabilities
      };
    }

    // Fetch packages
    if (type === 'packages' || type === 'all') {
      const packages = await prisma.scanPackageFinding.findMany({
        where: buildWhereClause('packages'),
        orderBy: [
          { packageName: 'asc' },
          { version: 'asc' }
        ]
      });

      // Group packages by type and source
      const pkgByType: Record<string, number> = {};
      const pkgBySource: Record<string, number> = {};
      const pkgByEcosystem: Record<string, number> = {};

      packages.forEach(pkg => {
        pkgByType[pkg.type] = (pkgByType[pkg.type] || 0) + 1;
        pkgBySource[pkg.source] = (pkgBySource[pkg.source] || 0) + 1;
        if (pkg.ecosystem) {
          pkgByEcosystem[pkg.ecosystem] = (pkgByEcosystem[pkg.ecosystem] || 0) + 1;
        }
      });

      result.packages = {
        total: packages.length,
        byType: pkgByType,
        bySource: pkgBySource,
        byEcosystem: pkgByEcosystem,
        findings: packages
      };
    }

    // Fetch compliance findings
    if (type === 'compliance' || type === 'all') {
      const compliance = await prisma.scanComplianceFinding.findMany({
        where: buildWhereClause('compliance'),
        orderBy: [
          { severity: 'desc' },
          { category: 'asc' },
          { ruleName: 'asc' }
        ]
      });

      // Group compliance by category and severity
      const compByCategory: Record<string, number> = {};
      const compBySeverity: Record<string, number> = {
        CRITICAL: 0,
        HIGH: 0,
        MEDIUM: 0,
        LOW: 0,
        INFO: 0
      };

      compliance.forEach(comp => {
        compByCategory[comp.category] = (compByCategory[comp.category] || 0) + 1;
        compBySeverity[comp.severity]++;
      });

      result.compliance = {
        total: compliance.length,
        bySeverity: compBySeverity,
        byCategory: compByCategory,
        findings: compliance
      };
    }

    // Fetch efficiency findings
    if (type === 'efficiency' || type === 'all') {
      const efficiency = await prisma.scanEfficiencyFinding.findMany({
        where: { scanId },
        orderBy: [
          { wastedBytes: 'desc' },
          { sizeBytes: 'desc' }
        ]
      });

      // Group efficiency by type
      const effByType: Record<string, number> = {};
      let totalWastedBytes = BigInt(0);
      let totalSizeBytes = BigInt(0);

      efficiency.forEach(eff => {
        effByType[eff.findingType] = (effByType[eff.findingType] || 0) + 1;
        if (eff.wastedBytes) totalWastedBytes += eff.wastedBytes;
        if (eff.sizeBytes) totalSizeBytes += eff.sizeBytes;
      });

      result.efficiency = {
        total: efficiency.length,
        byType: effByType,
        totalWastedBytes: totalWastedBytes.toString(),
        totalSizeBytes: totalSizeBytes.toString(),
        findings: efficiency.map(eff => ({
          ...eff,
          wastedBytes: eff.wastedBytes?.toString(),
          sizeBytes: eff.sizeBytes?.toString()
        }))
      };
    }

    // Add metadata summary if available
    if (scan.metadata) {
      result.summary = {
        vulnerabilityCritical: scan.metadata.vulnerabilityCritical,
        vulnerabilityHigh: scan.metadata.vulnerabilityHigh,
        vulnerabilityMedium: scan.metadata.vulnerabilityMedium,
        vulnerabilityLow: scan.metadata.vulnerabilityLow,
        vulnerabilityInfo: scan.metadata.vulnerabilityInfo,
        complianceScore: scan.metadata.complianceScore,
        complianceGrade: scan.metadata.complianceGrade,
        aggregatedRiskScore: scan.metadata.aggregatedRiskScore
      };
    }

    // Add correlations summary
    const correlations = await prisma.scanFindingCorrelation.findMany({
      where: { scanId },
      orderBy: { sourceCount: 'desc' }
    });

    result.correlations = {
      total: correlations.length,
      multiSource: correlations.filter(c => c.sourceCount > 1).length,
      highConfidence: correlations.filter(c => c.confidenceScore > 0.7).length
    };

    return NextResponse.json(serializeForJson(result));

  } catch (error) {
    console.error('Failed to fetch scan findings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch scan findings' },
      { status: 500 }
    );
  }
}
