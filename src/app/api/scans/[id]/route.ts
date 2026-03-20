import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { prismaToScanWithImage, serializeForJson } from '@/lib/utils/type-utils'
import { apiError } from '@/lib/api/api-utils'

const UpdateScanSchema = z.object({
  status: z.enum(['PENDING', 'RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED', 'CANCELLED']).optional(),
  errorMessage: z.string().optional().nullable(),
  riskScore: z.number().min(0).max(100).optional().nullable(),
  finishedAt: z.string().datetime().optional().nullable(),
})

/**
 * Normalize scanner data from relational tables into a consistent shape.
 * Falls back to JSONB metadata on the server side so clients don't need fallback chains.
 */
function normalizeScannerData(metadata: any): Record<string, any> {
  const scannerData: Record<string, any> = {};

  // Trivy: relational table -> normalized shape, else JSONB fallback
  if (metadata?.trivyResult) {
    const tableData = metadata.trivyResult;
    scannerData.trivy = {
      SchemaVersion: tableData.schemaVersion,
      ArtifactName: tableData.artifactName,
      ArtifactType: tableData.artifactType,
      Results:
        tableData.vulnerabilities?.reduce((acc: any[], vuln: any) => {
          const existingTarget = acc.find(
            (r: any) => r.Target === vuln.targetName
          );
          const vulnEntry = {
            VulnerabilityID: vuln.vulnerabilityId,
            PkgName: vuln.pkgName,
            InstalledVersion: vuln.installedVersion,
            FixedVersion: vuln.fixedVersion,
            Severity: vuln.severity,
            Title: vuln.title,
            Description: vuln.description,
            PrimaryURL: vuln.primaryUrl,
            CVSS: {
              nvd: {
                V3Score: vuln.cvssScoreV3,
                V3Vector: vuln.cvssVectorV3,
                V2Score: vuln.cvssScore,
                V2Vector: vuln.cvssVector,
              },
            },
          };
          if (existingTarget) {
            existingTarget.Vulnerabilities.push(vulnEntry);
          } else {
            acc.push({
              Target: vuln.targetName,
              Class: vuln.targetClass,
              Type: vuln.targetType,
              Vulnerabilities: [vulnEntry],
            });
          }
          return acc;
        }, []) || [],
    };
  } else if (metadata?.trivyResults) {
    scannerData.trivy = metadata.trivyResults;
  }

  // Grype: relational table -> normalized shape, else JSONB fallback
  if (metadata?.grypeResult) {
    const tableData = metadata.grypeResult;
    scannerData.grype = {
      matches:
        tableData.vulnerabilities?.map((vuln: any) => ({
          vulnerability: {
            id: vuln.vulnerabilityId,
            severity: vuln.severity,
            namespace: vuln.namespace,
            description: vuln.description,
            fix: {
              state: vuln.fixState,
              versions: vuln.fixVersions,
            },
            cvss: vuln.cvssV3Score
              ? [
                  {
                    version: '3.0',
                    metrics: { baseScore: vuln.cvssV3Score },
                    vector: vuln.cvssV3Vector,
                  },
                ]
              : vuln.cvssV2Score
              ? [
                  {
                    version: '2.0',
                    metrics: { baseScore: vuln.cvssV2Score },
                    vector: vuln.cvssV2Vector,
                  },
                ]
              : [],
            urls: vuln.urls,
          },
          artifact: {
            name: vuln.packageName,
            version: vuln.packageVersion,
            type: vuln.packageType,
            language: vuln.packageLanguage,
            locations: vuln.packagePath
              ? [{ path: vuln.packagePath }]
              : [],
          },
        })) || [],
      db: tableData.dbStatus,
    };
  } else if (metadata?.grypeResults) {
    scannerData.grype = metadata.grypeResults;
  }

  // Syft: relational table -> normalized shape, else JSONB fallback
  if (metadata?.syftResult) {
    const tableData = metadata.syftResult;
    scannerData.syft = {
      artifacts:
        tableData.packages?.map((pkg: any) => ({
          id: pkg.packageId,
          name: pkg.name,
          version: pkg.version,
          type: pkg.type,
          foundBy: pkg.foundBy,
          purl: pkg.purl,
          cpes: pkg.cpe ? [pkg.cpe] : [],
          language: pkg.language,
          licenses: pkg.licenses,
          metadata: pkg.metadata,
          locations: pkg.locations,
        })) || [],
      source: tableData.source,
      distro: tableData.distro,
      descriptor: { name: tableData.bomFormat },
      schema: { version: tableData.schemaVersion },
      packagesPagination: tableData.packagesPagination || undefined,
    };
  } else if (metadata?.syftResults) {
    scannerData.syft = metadata.syftResults;
  }

  // Dockle: relational table -> normalized shape, else JSONB fallback
  if (metadata?.dockleResult) {
    const tableData = metadata.dockleResult;
    scannerData.dockle = {
      summary: tableData.summary,
      details:
        tableData.violations?.map((violation: any) => ({
          code: violation.code,
          title: violation.title,
          level: violation.level,
          alerts: violation.alerts,
        })) || [],
    };
  } else if (metadata?.dockleResults) {
    scannerData.dockle = metadata.dockleResults;
  }

  // OSV: relational table -> normalized shape, else JSONB fallback
  if (metadata?.osvResult) {
    const tableData = metadata.osvResult;
    const packageGroups: Record<string, any> = {};
    tableData.vulnerabilities?.forEach((vuln: any) => {
      const key = `${vuln.packageEcosystem}:${vuln.packageName}:${vuln.packageVersion}`;
      if (!packageGroups[key]) {
        packageGroups[key] = {
          package: {
            name: vuln.packageName,
            ecosystem: vuln.packageEcosystem,
            version: vuln.packageVersion,
            purl: vuln.packagePurl,
          },
          vulnerabilities: [],
        };
      }
      packageGroups[key].vulnerabilities.push({
        id: vuln.osvId,
        aliases: vuln.aliases,
        summary: vuln.summary,
        details: vuln.details,
        severity: vuln.severity,
        affected: vuln.affected,
        references: vuln.references,
        published: vuln.published,
        modified: vuln.modified,
        database_specific: vuln.databaseSpecific,
      });
    });
    scannerData.osv = {
      results: Object.values(packageGroups).map((group) => ({
        packages: [group],
      })),
    };
  } else if (metadata?.osvResults) {
    scannerData.osv = metadata.osvResults;
  }

  // Dive: relational table -> normalized shape, else JSONB fallback
  if (metadata?.diveResult) {
    const tableData = metadata.diveResult;
    scannerData.dive = {
      image: {
        efficiencyScore: tableData.efficiencyScore,
        sizeBytes: Number(tableData.sizeBytes),
        inefficientBytes: Number(tableData.wastedBytes),
        inefficientFiles: tableData.inefficientFiles,
        duplicateFiles: tableData.duplicateFiles,
      },
      layer:
        tableData.layers?.map((layer: any) => ({
          id: layer.layerId,
          index: layer.layerIndex,
          digest: layer.digest,
          sizeBytes: Number(layer.sizeBytes),
          command: layer.command,
          addedFiles: layer.addedFiles,
          modifiedFiles: layer.modifiedFiles,
          removedFiles: layer.removedFiles,
          wastedBytes: Number(layer.wastedBytes),
          fileDetails: layer.fileDetails,
        })) || [],
    };
  } else if (metadata?.diveResults) {
    scannerData.dive = metadata.diveResults;
  }

  return scannerData;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const includeJsonb = searchParams.get('includeJsonb') === 'true'
    const packageLimit = parseInt(searchParams.get('packageLimit') || '100')
    const packagePage = parseInt(searchParams.get('packagePage') || '0')

    // Build metadata select/include based on query params
    const metadataQuery = includeJsonb ? {
      include: {
        grypeResult: {
          include: {
            vulnerabilities: true
          }
        },
        trivyResult: {
          include: {
            vulnerabilities: true,
            misconfigurations: true,
            secrets: true
          }
        },
        diveResult: {
          include: {
            layers: true
          }
        },
        syftResult: {
          include: {
            packages: {
              take: packageLimit,
              skip: packagePage * packageLimit,
              orderBy: { name: 'asc' as const }
            }
          }
        },
        dockleResult: {
          include: {
            violations: true
          }
        },
        osvResult: {
          include: {
            vulnerabilities: true
          }
        }
      }
    } : {
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        // Exclude JSONB fields by not selecting them
        trivyResults: false,
        grypeResults: false,
        syftResults: false,
        dockleResults: false,
        osvResults: false,
        diveResults: false,
        // Include all other metadata fields
        vulnerabilityCritical: true,
        vulnerabilityHigh: true,
        vulnerabilityMedium: true,
        vulnerabilityLow: true,
        vulnerabilityInfo: true,
        aggregatedRiskScore: true,
        complianceScore: true,
        complianceGrade: true,
        complianceFatal: true,
        complianceWarn: true,
        complianceInfo: true,
        compliancePass: true,
        scannerVersions: true,
        dockerId: true,
        dockerCreated: true,
        dockerSize: true,
        dockerArchitecture: true,
        dockerOs: true,
        dockerVersion: true,
        dockerComment: true,
        dockerDigest: true,
        dockerConfig: true,
        dockerMetadata: true,
        dockerRepoTags: true,
        dockerRepoDigests: true,
        dockerEnv: true,
        dockerLabels: true,
        dockerAuthor: true,
        dockerParent: true,
        dockerGraphDriver: true,
        dockerRootFS: true,
        // Include table relations
        grypeResult: {
          include: {
            vulnerabilities: true
          }
        },
        trivyResult: {
          include: {
            vulnerabilities: true,
            misconfigurations: true,
            secrets: true
          }
        },
        diveResult: {
          include: {
            layers: true
          }
        },
        syftResult: {
          include: {
            packages: {
              take: packageLimit,
              skip: packagePage * packageLimit,
              orderBy: { name: 'asc' as const }
            }
          }
        },
        dockleResult: {
          include: {
            violations: true
          }
        },
        osvResult: {
          include: {
            vulnerabilities: true
          }
        }
      }
    }

    // Try to find by ID first, then by requestId
    let scan = await prisma.scan.findUnique({
      where: { id },
      include: {
        image: true,
        metadata: metadataQuery
      }
    })

    if (!scan) {
      scan = await prisma.scan.findUnique({
        where: { requestId: id },
        include: {
          image: true,
          metadata: metadataQuery
        }
      })
    }

    if (!scan) {
      return NextResponse.json(
        { error: 'Scan not found' },
        { status: 404 }
      )
    }

    // Add package pagination info if syftResult exists
    if (scan.metadata && 'syftResult' in scan.metadata && scan.metadata.syftResult) {
      // Get total package count for pagination
      const totalPackages = await prisma.syftPackage.count({
        where: { syftResultsId: scan.metadata.syftResult.id }
      });

      // Add pagination metadata
      (scan.metadata.syftResult as any).packagesPagination = {
        total: totalPackages,
        page: packagePage,
        limit: packageLimit,
        pages: Math.ceil(totalPackages / packageLimit)
      };
    }

    // Convert Prisma data to properly typed scan
    const scanData = prismaToScanWithImage(scan);

    // Normalize scanner results on the server side so clients don't need fallback chains
    const scannerData = normalizeScannerData(scan.metadata);

    return NextResponse.json(serializeForJson({ ...scanData, scannerData }))
  } catch (error) {
    return apiError(error, 'Error retrieving scan');
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const parsed = UpdateScanSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues },
        { status: 400 }
      )
    }

    const updates = parsed.data

    // Find scan by ID or requestId
    let scan = await prisma.scan.findUnique({ where: { id } })
    if (!scan) {
      scan = await prisma.scan.findUnique({ where: { requestId: id } })
    }
    
    if (!scan) {
      return NextResponse.json(
        { error: 'Scan not found' },
        { status: 404 }
      )
    }
    
    // Update scan
    const updatedScan = await prisma.scan.update({
      where: { id: scan.id },
      data: {
        ...updates,
        updatedAt: new Date()
      },
      include: {
        image: true,
        metadata: {
          include: {
            grypeResult: { include: { vulnerabilities: true } },
            trivyResult: { include: { vulnerabilities: true, misconfigurations: true, secrets: true } },
            diveResult: { include: { layers: true } },
            syftResult: { include: { packages: { take: 100, orderBy: { name: 'asc' as const } } } },
            dockleResult: { include: { violations: true } },
            osvResult: { include: { vulnerabilities: true } },
          }
        }
      }
    })
    
    // Convert Prisma data to properly typed scan
    const scanData = prismaToScanWithImage(updatedScan);

    // Normalize scanner results on the server side so clients don't need fallback chains
    const scannerData = normalizeScannerData(updatedScan.metadata);

    return NextResponse.json(serializeForJson({ ...scanData, scannerData }))
  } catch (error) {
    return apiError(error, 'Error updating scan');
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    
    // Find scan by ID or requestId
    let scan = await prisma.scan.findUnique({ where: { id } })
    if (!scan) {
      scan = await prisma.scan.findUnique({ where: { requestId: id } })
    }
    
    if (!scan) {
      return NextResponse.json(
        { error: 'Scan not found' },
        { status: 404 }
      )
    }
    
    // Delete the scan and all related data (Prisma will handle cascading)
    await prisma.scan.delete({
      where: { id: scan.id }
    })
    
    return NextResponse.json(
      { success: true, message: 'Scan deleted successfully' },
      { status: 200 }
    )
  } catch (error) {
    return apiError(error, 'Error deleting scan');
  }
}