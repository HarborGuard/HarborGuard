/**
 * Script to fix package findings with "[object Object]" license values
 */

const { PrismaClient } = require('../src/generated/prisma');
const prisma = new PrismaClient();

// Helper function to format license data
function formatLicense(license) {
  if (!license) return null;
  if (typeof license === 'string') {
    // Don't change valid strings unless they're "[object Object]"
    if (license === '[object Object]') return null;
    return license;
  }
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

async function fixPackageLicenses() {
  try {
    // Find all package findings with "[object Object]" as license
    const packagesWithBadLicense = await prisma.scanPackageFinding.findMany({
      where: {
        license: '[object Object]'
      }
    });

    console.log(`Found ${packagesWithBadLicense.length} packages with "[object Object]" license`);

    if (packagesWithBadLicense.length === 0) {
      console.log('No packages need fixing');
      return;
    }

    // Try to fix each one by looking at its metadata
    let fixedCount = 0;
    let nulledCount = 0;

    for (const pkg of packagesWithBadLicense) {
      let fixedLicense = null;

      // Try to extract from metadata if available
      if (pkg.metadata && typeof pkg.metadata === 'object') {
        const metadata = pkg.metadata;
        
        // Try various common locations for license in metadata
        if (metadata.license) {
          fixedLicense = formatLicense(metadata.license);
        } else if (metadata.licenses) {
          fixedLicense = formatLicense(metadata.licenses);
        } else if (metadata.License) {
          fixedLicense = formatLicense(metadata.License);
        } else if (metadata.Licenses) {
          fixedLicense = formatLicense(metadata.Licenses);
        }
      }

      // Update the package with the fixed license
      await prisma.scanPackageFinding.update({
        where: { id: pkg.id },
        data: { license: fixedLicense }
      });

      if (fixedLicense) {
        fixedCount++;
        console.log(`Fixed package ${pkg.packageName}: "${fixedLicense}"`);
      } else {
        nulledCount++;
        console.log(`Set null for package ${pkg.packageName} (no license found)`);
      }
    }

    console.log(`\nSummary:`);
    console.log(`- Fixed ${fixedCount} packages with proper license values`);
    console.log(`- Set ${nulledCount} packages to null (no license found)`);
    console.log(`- Total processed: ${packagesWithBadLicense.length}`);

  } catch (error) {
    console.error('Error fixing package licenses:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixPackageLicenses();