/**
 * Script to fix package findings with "declared" license values
 * and replace them with actual license names
 */

const { PrismaClient } = require('../src/generated/prisma');
const prisma = new PrismaClient();

// Helper function to format license data
function formatLicense(license) {
  if (!license) return null;
  if (typeof license === 'string') {
    // Don't change valid license strings unless they're "declared"
    if (license === 'declared') return null;
    return license;
  }
  if (Array.isArray(license)) {
    return license.map(l => formatLicense(l)).filter(Boolean).join(', ');
  }
  if (typeof license === 'object') {
    // Handle common license object structures - prioritize actual license value
    if (license.value) return license.value;  // Syft format: {type: "declared", value: "MIT"}
    if (license.spdxExpression) return license.spdxExpression;  // SPDX expression
    if (license.name) return license.name;
    if (license.license) return license.license;
    if (license.expression) return license.expression;
    // Skip 'type' field as it usually contains "declared" which is not the actual license
    // Try to extract first meaningful string value from object
    const values = Object.values(license);
    const firstString = values.find(v => typeof v === 'string' && v !== 'declared');
    if (firstString) return firstString;
  }
  return null;
}

async function fixDeclaredLicenses() {
  try {
    // Find all package findings with "declared" as license
    const packagesWithDeclared = await prisma.scanPackageFinding.findMany({
      where: {
        license: 'declared'
      }
    });

    console.log(`Found ${packagesWithDeclared.length} packages with "declared" license`);

    if (packagesWithDeclared.length === 0) {
      console.log('No packages need fixing');
      return;
    }

    // Try to fix each one by looking at its metadata
    let fixedCount = 0;
    let nulledCount = 0;

    for (const pkg of packagesWithDeclared) {
      let fixedLicense = null;

      // Try to extract from metadata if available
      if (pkg.metadata && typeof pkg.metadata === 'object') {
        const metadata = pkg.metadata;
        
        // For Syft packages, the metadata might have the licenses array
        if (metadata.licenses && Array.isArray(metadata.licenses)) {
          // Extract actual license values from the array
          const licenses = metadata.licenses.map(l => {
            if (typeof l === 'object' && l.value) return l.value;
            if (typeof l === 'object' && l.spdxExpression) return l.spdxExpression;
            if (typeof l === 'string' && l !== 'declared') return l;
            return null;
          }).filter(Boolean);
          
          if (licenses.length > 0) {
            fixedLicense = licenses.join(', ');
          }
        }
        // Also check other potential locations
        else if (metadata.license) {
          fixedLicense = formatLicense(metadata.license);
        } else if (metadata.License) {
          fixedLicense = formatLicense(metadata.License);
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
        console.log(`Set null for package ${pkg.packageName} (no actual license found)`);
      }
    }

    // Also fix any "declared, declared, declared..." patterns
    const multiDeclared = await prisma.scanPackageFinding.findMany({
      where: {
        license: {
          contains: 'declared, declared'
        }
      }
    });

    console.log(`\nFound ${multiDeclared.length} packages with multiple "declared" values`);

    for (const pkg of multiDeclared) {
      let fixedLicense = null;

      // Try to extract from metadata if available
      if (pkg.metadata && typeof pkg.metadata === 'object') {
        const metadata = pkg.metadata;
        
        if (metadata.licenses && Array.isArray(metadata.licenses)) {
          const licenses = metadata.licenses.map(l => {
            if (typeof l === 'object' && l.value) return l.value;
            if (typeof l === 'object' && l.spdxExpression) return l.spdxExpression;
            if (typeof l === 'string' && l !== 'declared') return l;
            return null;
          }).filter(Boolean);
          
          if (licenses.length > 0) {
            fixedLicense = licenses.join(', ');
          }
        }
      }

      // Update the package
      await prisma.scanPackageFinding.update({
        where: { id: pkg.id },
        data: { license: fixedLicense }
      });

      if (fixedLicense) {
        console.log(`Fixed multi-declared package ${pkg.packageName}: "${fixedLicense}"`);
      }
    }

    console.log(`\nSummary:`);
    console.log(`- Fixed ${fixedCount} packages with proper license values`);
    console.log(`- Set ${nulledCount} packages to null (no actual license found)`);
    console.log(`- Total processed: ${packagesWithDeclared.length + multiDeclared.length}`);

  } catch (error) {
    console.error('Error fixing declared licenses:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixDeclaredLicenses();