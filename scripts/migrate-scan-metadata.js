const { PrismaClient } = require('../src/generated/prisma');

const prisma = new PrismaClient();

async function migrateScanMetadata() {
  try {
    console.log('Starting migration of scan metadata...\n');
    
    // Get all scans with metadata
    const scans = await prisma.scan.findMany({
      where: {
        metadata: {
          not: null
        }
      },
      orderBy: {
        createdAt: 'asc'
      }
    });
    
    console.log(`Found ${scans.length} scans with metadata to migrate\n`);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const scan of scans) {
      try {
        const metadata = scan.metadata;
        
        // Check if scan already has metadata linked
        if (scan.metadataId) {
          console.log(`✓ Scan ${scan.requestId} already has metadata linked`);
          successCount++;
          continue;
        }
        
        // Prepare the new metadata record (no scanId field anymore)
        const scanMetadata = {
          
          // Docker Image metadata
          dockerId: metadata.Id || null,
          dockerOs: metadata.Os || metadata.os || null,
          dockerArchitecture: metadata.Architecture || metadata.architecture || null,
          dockerSize: metadata.Size ? BigInt(metadata.Size) : null,
          dockerAuthor: metadata.Author || null,
          dockerCreated: metadata.Created ? new Date(metadata.Created) : null,
          dockerVersion: metadata.DockerVersion || null,
          dockerParent: metadata.Parent || null,
          dockerComment: metadata.Comment || null,
          dockerDigest: metadata.Digest || null,
          dockerConfig: metadata.Config || null,
          dockerRootFS: metadata.RootFS || null,
          dockerGraphDriver: metadata.GraphDriver || null,
          dockerRepoTags: metadata.RepoTags || null,
          dockerRepoDigests: metadata.RepoDigests || null,
          dockerMetadata: metadata.Metadata || null,
          dockerLabels: metadata.Labels || metadata.Config?.Labels || null,
          dockerEnv: metadata.Env || metadata.Config?.Env || null,
          
          // Scan Results
          trivyResults: metadata.scanResults?.trivy || null,
          grypeResults: metadata.scanResults?.grype || null,
          syftResults: metadata.scanResults?.syft || null,
          dockleResults: metadata.scanResults?.dockle || null,
          osvResults: metadata.scanResults?.osv || null,
          diveResults: metadata.scanResults?.dive || null,
          
          // Aggregated Data
          vulnerabilityCritical: metadata.aggregatedData?.vulnerabilityCount?.critical || 0,
          vulnerabilityHigh: metadata.aggregatedData?.vulnerabilityCount?.high || 0,
          vulnerabilityMedium: metadata.aggregatedData?.vulnerabilityCount?.medium || 0,
          vulnerabilityLow: metadata.aggregatedData?.vulnerabilityCount?.low || 0,
          vulnerabilityInfo: metadata.aggregatedData?.vulnerabilityCount?.info || 0,
          aggregatedRiskScore: metadata.aggregatedData?.riskScore || null,
          
          // Compliance scores
          complianceScore: metadata.aggregatedData?.complianceScore?.dockle?.score || null,
          complianceGrade: metadata.aggregatedData?.complianceScore?.dockle?.grade || null,
          complianceFatal: metadata.aggregatedData?.complianceScore?.dockle?.fatal || null,
          complianceWarn: metadata.aggregatedData?.complianceScore?.dockle?.warn || null,
          complianceInfo: metadata.aggregatedData?.complianceScore?.dockle?.info || null,
          compliancePass: metadata.aggregatedData?.complianceScore?.dockle?.pass || null,
          
          // Scanner versions
          scannerVersions: metadata.scannerVersions || null
        };
        
        // Create the new metadata record and link it to the scan
        const createdMetadata = await prisma.scanMetadata.create({
          data: scanMetadata
        });
        
        // Update the scan to link to the metadata
        await prisma.scan.update({
          where: { id: scan.id },
          data: { metadataId: createdMetadata.id }
        });
        
        console.log(`✓ Migrated scan ${scan.requestId} with metadata ID ${createdMetadata.id}`);
        successCount++;
        
      } catch (error) {
        console.error(`✗ Failed to migrate scan ${scan.requestId}:`, error.message);
        errorCount++;
      }
    }
    
    console.log(`\nMigration complete!`);
    console.log(`  ✓ Successfully migrated: ${successCount}`);
    console.log(`  ✗ Failed: ${errorCount}`);
    
    if (successCount > 0) {
      console.log('\nNote: The original metadata column in the Scan table has been preserved.');
      console.log('You can remove it after verifying the migration was successful.');
    }
    
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the migration
migrateScanMetadata();