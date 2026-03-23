import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { serializeForJson } from '@/lib/utils/type-utils';
import { apiError } from '@/lib/api/api-utils';

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
    const limit = Math.max(1, Math.min(parseInt(searchParams.get('limit') || '500') || 500, 2000));
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0') || 0);

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
      const [vulnerabilities, vulnTotal] = await Promise.all([
        prisma.scanVulnerabilityFinding.findMany({
          where: buildWhereClause('vulnerabilities'),
          orderBy: [
            { severity: 'desc' },
            { cvssScore: 'desc' },
            { cveId: 'asc' }
          ],
          take: limit,
          skip: offset
        }),
        prisma.scanVulnerabilityFinding.count({ where: buildWhereClause('vulnerabilities') })
      ]);

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
        total: vulnTotal,
        bySeverity: vulnBySeverity,
        bySource: Object.values(vulnBySource),
        findings: vulnerabilities,
        pagination: { total: vulnTotal, limit, offset, hasMore: offset + limit < vulnTotal }
      };
    }

    // Fetch packages
    if (type === 'packages' || type === 'all') {
      const [packages, pkgTotal] = await Promise.all([
        prisma.scanPackageFinding.findMany({
          where: buildWhereClause('packages'),
          orderBy: [
            { packageName: 'asc' },
            { version: 'asc' }
          ],
          take: limit,
          skip: offset
        }),
        prisma.scanPackageFinding.count({ where: buildWhereClause('packages') })
      ]);

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
        total: pkgTotal,
        byType: pkgByType,
        bySource: pkgBySource,
        byEcosystem: pkgByEcosystem,
        findings: packages,
        pagination: { total: pkgTotal, limit, offset, hasMore: offset + limit < pkgTotal }
      };
    }

    // Fetch compliance findings
    if (type === 'compliance' || type === 'all') {
      const [compliance, compTotal] = await Promise.all([
        prisma.scanComplianceFinding.findMany({
          where: buildWhereClause('compliance'),
          orderBy: [
            { severity: 'desc' },
            { category: 'asc' },
            { ruleName: 'asc' }
          ],
          take: limit,
          skip: offset
        }),
        prisma.scanComplianceFinding.count({ where: buildWhereClause('compliance') })
      ]);

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
        total: compTotal,
        bySeverity: compBySeverity,
        byCategory: compByCategory,
        findings: compliance,
        pagination: { total: compTotal, limit, offset, hasMore: offset + limit < compTotal }
      };
    }

    // Fetch efficiency findings
    if (type === 'efficiency' || type === 'all') {
      const [efficiency, effTotal] = await Promise.all([
        prisma.scanEfficiencyFinding.findMany({
          where: { scanId },
          orderBy: [
            { wastedBytes: 'desc' },
            { sizeBytes: 'desc' }
          ],
          take: limit,
          skip: offset
        }),
        prisma.scanEfficiencyFinding.count({ where: { scanId } })
      ]);

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
        total: effTotal,
        byType: effByType,
        totalWastedBytes: totalWastedBytes.toString(),
        totalSizeBytes: totalSizeBytes.toString(),
        findings: efficiency.map(eff => ({
          ...eff,
          wastedBytes: eff.wastedBytes?.toString(),
          sizeBytes: eff.sizeBytes?.toString()
        })),
        pagination: { total: effTotal, limit, offset, hasMore: offset + limit < effTotal }
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
    return apiError(error, 'Failed to fetch scan findings');
  }
}
