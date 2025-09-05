const { PrismaClient } = require('../src/generated/prisma');
const prisma = new PrismaClient();

async function checkLicenses() {
  try {
    const scanId = 'cmf71ekts0002lnwc874m5lvx';
    
    // Count packages with [object Object] license
    const badLicenses = await prisma.scanPackageFinding.count({
      where: {
        scanId,
        license: '[object Object]'
      }
    });
    
    // Get sample of packages with licenses
    const samples = await prisma.scanPackageFinding.findMany({
      where: {
        scanId,
        license: { not: null }
      },
      select: {
        packageName: true,
        license: true
      },
      take: 10
    });
    
    // Get unique license values
    const uniqueLicenses = await prisma.scanPackageFinding.groupBy({
      by: ['license'],
      where: { scanId },
      _count: true
    });
    
    console.log(`Scan ID: ${scanId}`);
    console.log(`Packages with "[object Object]" license: ${badLicenses}`);
    console.log('\nSample packages with licenses:');
    samples.forEach(pkg => {
      console.log(`  ${pkg.packageName}: "${pkg.license}"`);
    });
    
    console.log('\nUnique license values and counts:');
    uniqueLicenses.forEach(group => {
      console.log(`  "${group.license}": ${group._count} packages`);
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkLicenses();