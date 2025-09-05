/**
 * Migration script to populate normalized scanner finding tables
 * from existing JSON data in ScanMetadata
 */

const { PrismaClient } = require('../src/generated/prisma');
const prisma = new PrismaClient();

// Helper function to format license data
function formatLicense(license) {
  if (!license) return null;
  if (typeof license === 'string') return license;
  if (Array.isArray(license)) {
    return license.map(l => formatLicense(l)).filter(Boolean).join(', ');
  }
  if (typeof license === 'object') {
    // Handle common license object structures
    if (license.name) return license.name;
    if (license.type) return license.type;
    if (license.value) return license.value;
    if (license.license) return license.license;
    if (license.expression) return license.expression;
    // Try to extract first string value from object
    const values = Object.values(license);
    const firstString = values.find(v => typeof v === 'string');
    if (firstString) return firstString;
  }
  return null;
}

async function migrateVulnerabilityFindings(scan, metadata) {
  const findings = [];
  
  // Process Trivy results
  if (metadata.trivyResults?.Results) {
    for (const result of metadata.trivyResults.Results) {
      if (result.Vulnerabilities) {
        for (const vuln of result.Vulnerabilities) {
          findings.push({
            scanId: scan.id,
            source: 'trivy',
            cveId: vuln.VulnerabilityID || vuln.PkgID,
            packageName: vuln.PkgName || vuln.PkgID,
            installedVersion: vuln.InstalledVersion,
            fixedVersion: vuln.FixedVersion || null,
            severity: mapSeverity(vuln.Severity),
            cvssScore: vuln.CVSS?.nvd?.V3Score || vuln.CVSS?.redhat?.V3Score || null,
            dataSource: vuln.DataSource?.Name || null,
            vulnerabilityUrl: vuln.PrimaryURL || null,
            title: vuln.Title || null,
            description: vuln.Description || null,
            publishedDate: vuln.PublishedDate ? new Date(vuln.PublishedDate) : null,
            lastModified: vuln.LastModifiedDate ? new Date(vuln.LastModifiedDate) : null,
            filePath: result.Target || null,
            packageType: result.Type || null,
            rawFinding: vuln
          });
        }
      }
    }
  }
  
  // Process Grype results
  if (metadata.grypeResults?.matches) {
    for (const match of metadata.grypeResults.matches) {
      const vuln = match.vulnerability;
      findings.push({
        scanId: scan.id,
        source: 'grype',
        cveId: vuln.id,
        packageName: match.artifact.name,
        installedVersion: match.artifact.version,
        fixedVersion: vuln.fix?.versions?.[0] || null,
        severity: mapSeverity(vuln.severity),
        cvssScore: vuln.cvss?.[0]?.metrics?.baseScore || null,
        dataSource: vuln.dataSource || null,
        vulnerabilityUrl: vuln.urls?.[0] || null,
        title: null,
        description: vuln.description || null,
        filePath: match.artifact.locations?.[0]?.path || null,
        layerId: match.artifact.locations?.[0]?.layerID || null,
        packageType: match.artifact.type || null,
        rawFinding: match
      });
    }
  }
  
  // Process OSV results
  if (metadata.osvResults?.results) {
    for (const result of metadata.osvResults.results) {
      for (const pkg of result.packages || []) {
        for (const vuln of pkg.vulnerabilities || []) {
          findings.push({
            scanId: scan.id,
            source: 'osv',
            cveId: vuln.id,
            packageName: pkg.package.name,
            installedVersion: pkg.package.version,
            fixedVersion: null, // OSV doesn't provide fixed version directly
            severity: mapOsvSeverity(vuln.severity),
            cvssScore: extractOsvScore(vuln.severity),
            dataSource: vuln.database_specific?.source || 'osv',
            vulnerabilityUrl: vuln.references?.[0]?.url || null,
            title: vuln.summary || null,
            description: vuln.details || null,
            publishedDate: vuln.published ? new Date(vuln.published) : null,
            lastModified: vuln.modified ? new Date(vuln.modified) : null,
            filePath: result.source?.path || null,
            packageType: pkg.package.ecosystem || null,
            rawFinding: vuln
          });
        }
      }
    }
  }
  
  if (findings.length > 0) {
    await prisma.scanVulnerabilityFinding.createMany({ data: findings });
    console.log(`  - Created ${findings.length} vulnerability findings`);
  }
  
  return findings.length;
}

async function migratePackageFindings(scan, metadata) {
  const findings = [];
  
  // Process Syft results
  if (metadata.syftResults?.artifacts) {
    for (const artifact of metadata.syftResults.artifacts) {
      findings.push({
        scanId: scan.id,
        source: 'syft',
        packageName: artifact.name,
        version: artifact.version || null,
        type: artifact.type || 'unknown',
        purl: artifact.purl || null,
        license: formatLicense(artifact.licenses) || null,
        vendor: artifact.vendor || null,
        publisher: artifact.publisher || null,
        ecosystem: artifact.language || null,
        language: artifact.language || null,
        filePath: artifact.locations?.[0]?.path || null,
        layerId: artifact.locations?.[0]?.layerID || null,
        metadata: artifact.metadata || null,
        dependencies: artifact.upstreams || null
      });
    }
  }
  
  // Also extract packages from Trivy (it includes SBOM data)
  if (metadata.trivyResults?.Results) {
    for (const result of metadata.trivyResults.Results) {
      if (result.Packages) {
        for (const pkg of result.Packages) {
          findings.push({
            scanId: scan.id,
            source: 'trivy',
            packageName: pkg.Name,
            version: pkg.Version || null,
            type: result.Type || 'unknown',
            purl: null,
            license: formatLicense(pkg.License) || null,
            vendor: null,
            publisher: null,
            ecosystem: result.Type || null,
            language: null,
            filePath: result.Target || null,
            layerId: null,
            metadata: pkg
          });
        }
      }
    }
  }
  
  if (findings.length > 0) {
    await prisma.scanPackageFinding.createMany({ data: findings });
    console.log(`  - Created ${findings.length} package findings`);
  }
  
  return findings.length;
}

async function migrateComplianceFindings(scan, metadata) {
  const findings = [];
  
  // Process Dockle results
  if (metadata.dockleResults?.details) {
    for (const detail of metadata.dockleResults.details) {
      for (const alert of detail.alerts || []) {
        findings.push({
          scanId: scan.id,
          source: 'dockle',
          ruleId: detail.code,
          ruleName: detail.title,
          category: mapDockleCategory(detail.level),
          severity: mapDockleSeverity(detail.level),
          message: alert,
          description: detail.details || null,
          remediation: null, // Dockle doesn't provide remediation
          filePath: null,
          lineNumber: null,
          code: null,
          rawFinding: detail
        });
      }
    }
  }
  
  if (findings.length > 0) {
    await prisma.scanComplianceFinding.createMany({ data: findings });
    console.log(`  - Created ${findings.length} compliance findings`);
  }
  
  return findings.length;
}

async function migrateEfficiencyFindings(scan, metadata) {
  const findings = [];
  
  // Process Dive results
  if (metadata.diveResults?.layer) {
    for (const layer of metadata.diveResults.layer) {
      // Check for wasted space
      if (layer.sizeBytes > 50 * 1024 * 1024) { // Layers over 50MB
        findings.push({
          scanId: scan.id,
          source: 'dive',
          findingType: 'large_layer',
          severity: layer.sizeBytes > 100 * 1024 * 1024 ? 'warning' : 'info',
          layerId: layer.id,
          layerIndex: layer.index,
          layerCommand: layer.command || null,
          sizeBytes: BigInt(layer.sizeBytes),
          wastedBytes: null,
          efficiencyScore: null,
          description: `Large layer detected: ${(layer.sizeBytes / 1024 / 1024).toFixed(2)}MB`,
          filePaths: null,
          rawFinding: layer
        });
      }
    }
  }
  
  if (findings.length > 0) {
    await prisma.scanEfficiencyFinding.createMany({ data: findings });
    console.log(`  - Created ${findings.length} efficiency findings`);
  }
  
  return findings.length;
}

async function createFindingCorrelations(scan) {
  // Get all vulnerability findings for this scan
  const vulnFindings = await prisma.scanVulnerabilityFinding.findMany({
    where: { scanId: scan.id },
    select: { cveId: true, source: true, severity: true }
  });
  
  // Group by CVE ID
  const correlations = {};
  for (const finding of vulnFindings) {
    if (!correlations[finding.cveId]) {
      correlations[finding.cveId] = {
        sources: new Set(),
        severities: []
      };
    }
    correlations[finding.cveId].sources.add(finding.source);
    correlations[finding.cveId].severities.push(finding.severity);
  }
  
  // Create correlation records
  const correlationData = [];
  for (const [cveId, data] of Object.entries(correlations)) {
    const sources = Array.from(data.sources);
    correlationData.push({
      scanId: scan.id,
      findingType: 'vulnerability',
      correlationKey: cveId,
      sources: sources,
      sourceCount: sources.length,
      confidenceScore: sources.length / 3, // 3 is max number of vuln scanners
      severity: getHighestSeverity(data.severities)
    });
  }
  
  if (correlationData.length > 0) {
    await prisma.scanFindingCorrelation.createMany({ data: correlationData });
    console.log(`  - Created ${correlationData.length} finding correlations`);
  }
  
  return correlationData.length;
}

// Helper functions
function mapSeverity(severity) {
  const normalized = severity?.toUpperCase();
  switch (normalized) {
    case 'CRITICAL': return 'CRITICAL';
    case 'HIGH': return 'HIGH';
    case 'MEDIUM': return 'MEDIUM';
    case 'LOW': return 'LOW';
    case 'INFO':
    case 'NEGLIGIBLE':
    case 'UNKNOWN':
      return 'INFO';
    default: return 'INFO';
  }
}

function mapOsvSeverity(severities) {
  if (!severities || severities.length === 0) return 'INFO';
  
  // Look for CVSS scores
  for (const sev of severities) {
    if (sev.type === 'CVSS_V3' && sev.score) {
      const score = parseFloat(sev.score);
      if (score >= 9.0) return 'CRITICAL';
      if (score >= 7.0) return 'HIGH';
      if (score >= 4.0) return 'MEDIUM';
      if (score >= 0.1) return 'LOW';
    }
  }
  
  return 'INFO';
}

function extractOsvScore(severities) {
  if (!severities || severities.length === 0) return null;
  
  for (const sev of severities) {
    if (sev.type === 'CVSS_V3' && sev.score) {
      return parseFloat(sev.score);
    }
  }
  
  return null;
}

function mapDockleCategory(level) {
  switch (level) {
    case 'FATAL': return 'Security';
    case 'WARN': return 'BestPractice';
    case 'INFO': return 'CIS';
    default: return 'BestPractice';
  }
}

function mapDockleSeverity(level) {
  switch (level) {
    case 'FATAL': return 'CRITICAL';
    case 'WARN': return 'MEDIUM';
    case 'INFO': return 'LOW';
    default: return 'INFO';
  }
}

function getHighestSeverity(severities) {
  const order = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];
  for (const level of order) {
    if (severities.includes(level)) {
      return level;
    }
  }
  return 'INFO';
}

// Main migration function
async function main() {
  console.log('Starting scanner findings migration...\n');
  
  try {
    // Get all scans with metadata
    const scans = await prisma.scan.findMany({
      where: {
        metadataId: { not: null }
      },
      include: {
        metadata: true
      }
    });
    
    console.log(`Found ${scans.length} scans with metadata to migrate\n`);
    
    let totalVulnFindings = 0;
    let totalPkgFindings = 0;
    let totalCompFindings = 0;
    let totalEffFindings = 0;
    let totalCorrelations = 0;
    
    for (const scan of scans) {
      console.log(`Processing scan ${scan.id}...`);
      
      if (!scan.metadata) {
        console.log('  - No metadata found, skipping');
        continue;
      }
      
      // Migrate each type of finding
      totalVulnFindings += await migrateVulnerabilityFindings(scan, scan.metadata);
      totalPkgFindings += await migratePackageFindings(scan, scan.metadata);
      totalCompFindings += await migrateComplianceFindings(scan, scan.metadata);
      totalEffFindings += await migrateEfficiencyFindings(scan, scan.metadata);
      totalCorrelations += await createFindingCorrelations(scan);
    }
    
    console.log('\n=== Migration Summary ===');
    console.log(`Total vulnerability findings: ${totalVulnFindings}`);
    console.log(`Total package findings: ${totalPkgFindings}`);
    console.log(`Total compliance findings: ${totalCompFindings}`);
    console.log(`Total efficiency findings: ${totalEffFindings}`);
    console.log(`Total correlations: ${totalCorrelations}`);
    console.log('\nMigration completed successfully!');
    
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());