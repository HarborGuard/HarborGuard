const { PrismaClient } = require('../src/generated/prisma');

const prisma = new PrismaClient();

async function checkMetadataStructure() {
  try {
    // Get a few scans with metadata
    const scans = await prisma.scan.findMany({
      where: {
        metadata: {
          not: null
        }
      },
      take: 3,
      orderBy: {
        createdAt: 'desc'
      }
    });

    console.log('Found', scans.length, 'scans with metadata\n');

    scans.forEach((scan, index) => {
      console.log(`\n========= Scan ${index + 1} (ID: ${scan.id}) =========`);
      console.log('Request ID:', scan.requestId);
      console.log('Status:', scan.status);
      
      if (scan.metadata) {
        const metadata = scan.metadata;
        console.log('\nMetadata structure:');
        console.log('Top-level keys:', Object.keys(metadata));
        
        // Check for scan results
        if (metadata.scanResults) {
          console.log('Scan Results keys:', Object.keys(metadata.scanResults));
        }
        
        // Check for aggregated data
        if (metadata.aggregatedData) {
          console.log('Aggregated Data keys:', Object.keys(metadata.aggregatedData));
          
          if (metadata.aggregatedData.vulnerabilityCount) {
            console.log('Vulnerability Count:', metadata.aggregatedData.vulnerabilityCount);
          }
          
          if (metadata.aggregatedData.complianceScore) {
            console.log('Compliance Score keys:', Object.keys(metadata.aggregatedData.complianceScore));
          }
        }
        
        // Check for scanner versions
        if (metadata.scannerVersions) {
          console.log('Scanner Versions:', metadata.scannerVersions);
        }
        
        // Show full metadata structure (limited depth)
        console.log('\nFull metadata (limited depth):');
        console.log(JSON.stringify(metadata, null, 2).substring(0, 2000));
      }
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkMetadataStructure();