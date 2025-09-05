const { PrismaClient } = require('../src/generated/prisma');

const prisma = new PrismaClient();

async function updateMetadataRelationship() {
  try {
    console.log('Updating metadata relationship...\n');
    
    // Get all scans with their metadata
    const scansWithMetadata = await prisma.scan.findMany({
      where: {
        scanMetadata: {
          isNot: null
        }
      },
      include: {
        scanMetadata: true
      }
    });
    
    console.log(`Found ${scansWithMetadata.length} scans with metadata to update\n`);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const scan of scansWithMetadata) {
      try {
        // Update the scan to point to the metadata ID
        await prisma.scan.update({
          where: { id: scan.id },
          data: {
            metadataId: scan.scanMetadata.id
          }
        });
        
        console.log(`✓ Updated scan ${scan.requestId} to use metadataId: ${scan.scanMetadata.id}`);
        successCount++;
        
      } catch (error) {
        console.error(`✗ Failed to update scan ${scan.requestId}:`, error.message);
        errorCount++;
      }
    }
    
    console.log(`\nUpdate complete!`);
    console.log(`  ✓ Successfully updated: ${successCount}`);
    console.log(`  ✗ Failed: ${errorCount}`);
    
  } catch (error) {
    console.error('Update failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the update
updateMetadataRelationship();