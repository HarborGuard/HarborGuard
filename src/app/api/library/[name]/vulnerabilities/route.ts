import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiError } from '@/lib/api/api-utils';

interface LibraryVulnerabilityRow {
  cveId: string;
  severity: string;
  scannerSources: string[];
  scanCount: number;
  affectedImages: Array<{ name: string; tag: string }>;
  affectedImageCount: number;
  installedVersion?: string;
  fixedVersion?: string;
  cvssScore?: number;
  description?: string;
  title?: string;
  references: string[];
  vulnerabilityUrl?: string;
}

interface LibraryVulnerabilitiesResponse {
  package: string;
  totalScans: number;
  affectedScans: number;
  vulnerabilities: LibraryVulnerabilityRow[];
}

const SEVERITY_WEIGHT: Record<string, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
  INFO: 0,
};

function compareSeverity(a: string, b: string): number {
  return (SEVERITY_WEIGHT[b] ?? -1) - (SEVERITY_WEIGHT[a] ?? -1);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name: rawName } = await params;
    const packageName = decodeURIComponent(rawName || '').trim();

    if (!packageName) {
      return NextResponse.json(
        { error: 'Package name is required' },
        { status: 400 }
      );
    }

    // Pull every finding for this exact package name across every scan in the
    // system. This is the data the library detail page needs to render the
    // per-CVE rows, severity counts, and "affected images" stat. We rely on
    // the existing index on (packageName) for selectivity.
    const findings = await prisma.scanVulnerabilityFinding.findMany({
      where: { packageName },
      select: {
        scanId: true,
        source: true,
        cveId: true,
        severity: true,
        cvssScore: true,
        title: true,
        description: true,
        installedVersion: true,
        fixedVersion: true,
        vulnerabilityUrl: true,
        scan: {
          select: {
            id: true,
            tag: true,
            image: {
              select: {
                name: true,
                tag: true,
              },
            },
          },
        },
      },
    });

    // Total scans in the system (used by the page for context).
    const totalScans = await prisma.scan.count();

    if (findings.length === 0) {
      const empty: LibraryVulnerabilitiesResponse = {
        package: packageName,
        totalScans,
        affectedScans: 0,
        vulnerabilities: [],
      };
      return NextResponse.json(empty);
    }

    // Aggregate findings keyed by CVE, picking the worst severity and highest
    // CVSS across scanners. Track unique images and scans per CVE.
    const byCve = new Map<
      string,
      {
        cveId: string;
        severity: string;
        cvssScore?: number;
        title?: string;
        description?: string;
        installedVersion?: string;
        fixedVersion?: string;
        vulnerabilityUrl?: string;
        scannerSources: Set<string>;
        scans: Set<string>;
        images: Map<string, { name: string; tag: string }>;
        references: Set<string>;
      }
    >();

    // Track all unique scans that contain this package (for affectedScans).
    const allAffectedScans = new Set<string>();

    for (const finding of findings) {
      allAffectedScans.add(finding.scanId);
      const cveId = finding.cveId;
      if (!cveId) continue;

      let entry = byCve.get(cveId);
      if (!entry) {
        entry = {
          cveId,
          severity: finding.severity,
          cvssScore: finding.cvssScore ?? undefined,
          title: finding.title ?? undefined,
          description: finding.description ?? undefined,
          installedVersion: finding.installedVersion ?? undefined,
          fixedVersion: finding.fixedVersion ?? undefined,
          vulnerabilityUrl: finding.vulnerabilityUrl ?? undefined,
          scannerSources: new Set<string>(),
          scans: new Set<string>(),
          images: new Map<string, { name: string; tag: string }>(),
          references: new Set<string>(),
        };
        byCve.set(cveId, entry);
      } else {
        // Promote to highest severity seen across scanners.
        if (compareSeverity(finding.severity, entry.severity) < 0) {
          entry.severity = finding.severity;
        }
        // Take the highest CVSS score.
        const newCvss = finding.cvssScore ?? undefined;
        if (newCvss !== undefined && (entry.cvssScore === undefined || newCvss > entry.cvssScore)) {
          entry.cvssScore = newCvss;
        }
        // Backfill descriptive fields if missing.
        if (!entry.description && finding.description) entry.description = finding.description;
        if (!entry.title && finding.title) entry.title = finding.title;
        if (!entry.installedVersion && finding.installedVersion) {
          entry.installedVersion = finding.installedVersion;
        }
        if (!entry.fixedVersion && finding.fixedVersion) {
          entry.fixedVersion = finding.fixedVersion;
        }
        if (!entry.vulnerabilityUrl && finding.vulnerabilityUrl) {
          entry.vulnerabilityUrl = finding.vulnerabilityUrl;
        }
      }

      if (finding.source) entry.scannerSources.add(finding.source);
      entry.scans.add(finding.scanId);
      if (finding.vulnerabilityUrl) entry.references.add(finding.vulnerabilityUrl);

      const imageName = finding.scan.image?.name ?? 'unknown';
      const imageTag = finding.scan.tag || finding.scan.image?.tag || 'latest';
      const imageKey = `${imageName}:${imageTag}`;
      if (!entry.images.has(imageKey)) {
        entry.images.set(imageKey, { name: imageName, tag: imageTag });
      }
    }

    const vulnerabilities: LibraryVulnerabilityRow[] = Array.from(byCve.values())
      .map((entry) => ({
        cveId: entry.cveId,
        severity: entry.severity,
        scannerSources: Array.from(entry.scannerSources).sort(),
        scanCount: entry.scans.size,
        affectedImages: Array.from(entry.images.values()),
        affectedImageCount: entry.images.size,
        installedVersion: entry.installedVersion,
        fixedVersion: entry.fixedVersion,
        cvssScore: entry.cvssScore,
        description: entry.description,
        title: entry.title,
        references: Array.from(entry.references),
        vulnerabilityUrl: entry.vulnerabilityUrl,
      }))
      .sort((a, b) => {
        const sev = compareSeverity(a.severity, b.severity);
        if (sev !== 0) return sev;
        const aCvss = a.cvssScore ?? -1;
        const bCvss = b.cvssScore ?? -1;
        if (bCvss !== aCvss) return bCvss - aCvss;
        return a.cveId.localeCompare(b.cveId);
      });

    const response: LibraryVulnerabilitiesResponse = {
      package: packageName,
      totalScans,
      affectedScans: allAffectedScans.size,
      vulnerabilities,
    };

    return NextResponse.json(response);
  } catch (error) {
    return apiError(error, 'Failed to fetch library vulnerabilities');
  }
}
