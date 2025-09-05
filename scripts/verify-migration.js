const { PrismaClient } = require('../src/generated/prisma');

const prisma = new PrismaClient();

async function verifyMigration() {
  try {
    console.log('Verifying ScanMetadata migration...\n');
    
    // Count ScanMetadata records
    const metadataCount = await prisma.scanMetadata.count();
    console.log(`✓ Found ${metadataCount} ScanMetadata records`);
    
    // Get sample metadata
    const sampleMetadata = await prisma.scanMetadata.findFirst({
      include: {
        scan: {
          select: {
            requestId: true,
            status: true
          }
        }
      }
    });
    
    if (sampleMetadata) {
      console.log('\n✓ Sample ScanMetadata record:');
      console.log('  Scan Request ID:', sampleMetadata.scan.requestId);
      console.log('  Docker OS:', sampleMetadata.dockerOs);
      console.log('  Docker Architecture:', sampleMetadata.dockerArchitecture);
      console.log('  Docker Size:', sampleMetadata.dockerSize ? sampleMetadata.dockerSize.toString() : 'null');
      console.log('  Vulnerabilities:');
      console.log('    - Critical:', sampleMetadata.vulnerabilityCritical);
      console.log('    - High:', sampleMetadata.vulnerabilityHigh);
      console.log('    - Medium:', sampleMetadata.vulnerabilityMedium);
      console.log('    - Low:', sampleMetadata.vulnerabilityLow);
      console.log('  Compliance Grade:', sampleMetadata.complianceGrade);
      console.log('  Risk Score:', sampleMetadata.aggregatedRiskScore);
      console.log('  Has Trivy Results:', !!sampleMetadata.trivyResults);
      console.log('  Has Grype Results:', !!sampleMetadata.grypeResults);
      console.log('  Has Dockle Results:', !!sampleMetadata.dockleResults);
    }
    
    // Check for orphaned scans without metadata
    const scansWithoutMetadata = await prisma.scan.findMany({
      where: {
        scanMetadata: null,
        metadata: {
          not: null
        }
      },
      select: {
        id: true,
        requestId: true
      }
    });
    
    if (scansWithoutMetadata.length > 0) {
      console.log(`\n⚠ Found ${scansWithoutMetadata.length} scans with old metadata but no ScanMetadata record`);
      console.log('These may need to be migrated:');
      scansWithoutMetadata.forEach(scan => {
        console.log(`  - ${scan.requestId}`);
      });
    } else {
      console.log('\n✓ All scans with metadata have been migrated');
    }
    
    console.log('\n✅ Migration verification complete!');
    
  } catch (error) {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

verifyMigration();