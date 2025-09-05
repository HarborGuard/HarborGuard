const { PrismaClient } = require('../src/generated/prisma');
const prisma = new PrismaClient();

async function main() {
  const count = await prisma.scan.count();
  console.log('Total scans:', count);
  
  const scansWithMetadata = await prisma.scan.count({ 
    where: { metadataId: { not: null } } 
  });
  console.log('Scans with metadata:', scansWithMetadata);
  
  // Get a sample scan
  const sampleScan = await prisma.scan.findFirst({
    include: {
      metadata: true,
      image: true
    }
  });
  
  if (sampleScan) {
    console.log('\nSample scan:');
    console.log('- ID:', sampleScan.id);
    console.log('- Status:', sampleScan.status);
    console.log('- Has metadata:', !!sampleScan.metadata);
    if (sampleScan.metadata) {
      console.log('- Metadata dockerSize:', sampleScan.metadata.dockerSize);
    }
  } else {
    console.log('\nNo scans found in database');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());