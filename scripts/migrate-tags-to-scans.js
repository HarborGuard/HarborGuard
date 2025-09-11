#!/usr/bin/env node

/**
 * Data migration script to populate scan.tag from image.tag
 * 
 * This script:
 * 1. Finds all scans that have a tag value of 'latest' (the default)
 * 2. Updates the scan.tag to match the tag from the related image
 * 3. Provides logging and rollback information
 */

const { PrismaClient } = require('../src/generated/prisma');

async function migrateTagsToScans() {
  const prisma = new PrismaClient();
  
  try {
    console.log('🚀 Starting tag migration from images to scans...');
    
    // Get all scans with their related images
    const scansWithImages = await prisma.scan.findMany({
      where: {
        tag: 'latest' // Only migrate scans that haven't been updated yet
      },
      include: {
        image: true
      }
    });
    
    console.log(`📊 Found ${scansWithImages.length} scans to migrate`);
    
    if (scansWithImages.length === 0) {
      console.log('✅ No scans need migration. All done!');
      return;
    }
    
    let migrated = 0;
    let errors = 0;
    
    for (const scan of scansWithImages) {
      try {
        // Update the scan tag to match the image tag
        await prisma.scan.update({
          where: { id: scan.id },
          data: { tag: scan.image.tag }
        });
        
        migrated++;
        
        if (migrated % 100 === 0) {
          console.log(`📈 Migrated ${migrated}/${scansWithImages.length} scans...`);
        }
      } catch (error) {
        console.error(`❌ Error migrating scan ${scan.id}:`, error.message);
        errors++;
      }
    }
    
    console.log(`✅ Migration completed!`);
    console.log(`   - Successfully migrated: ${migrated} scans`);
    console.log(`   - Errors: ${errors} scans`);
    
    if (errors > 0) {
      console.log('⚠️  Some scans failed to migrate. Check the errors above.');
    }
    
    // Verify the migration
    console.log('\n🔍 Verification:');
    const updatedScans = await prisma.scan.findMany({
      where: {
        tag: { not: 'latest' }
      }
    });
    console.log(`   - Scans with custom tags: ${updatedScans.length}`);
    
    const remainingDefaultScans = await prisma.scan.findMany({
      where: {
        tag: 'latest'
      }
    });
    console.log(`   - Scans still with 'latest' tag: ${remainingDefaultScans.length}`);
    
  } catch (error) {
    console.error('💥 Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the migration
migrateTagsToScans()
  .then(() => {
    console.log('\n🎉 Tag migration completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Tag migration failed:', error);
    process.exit(1);
  });