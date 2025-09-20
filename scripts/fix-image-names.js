#!/usr/bin/env node

/**
 * Script to fix image names that incorrectly include the registry URL
 * This removes registry URLs from image names where they shouldn't be
 */

const { PrismaClient } = require('../src/generated/prisma');
const prisma = new PrismaClient();

async function fixImageNames() {
  console.log('Starting image name cleanup...');
  
  try {
    // Find all images that might have registry URLs in their names
    const images = await prisma.image.findMany({
      where: {
        OR: [
          { name: { contains: 'localhost:' } },
          { name: { contains: ':5000/' } },
          { name: { contains: ':443/' } },
          { name: { contains: ':80/' } },
          { name: { contains: 'http://' } },
          { name: { contains: 'https://' } },
        ]
      },
      include: {
        repositoryImages: {
          include: {
            repository: true
          }
        }
      }
    });
    
    console.log(`Found ${images.length} images that might need fixing`);
    
    let fixedCount = 0;
    
    for (const image of images) {
      let cleanName = image.name;
      let wasFixed = false;
      
      // Check if the image has an associated repository
      const repoImage = image.repositoryImages[0];
      if (repoImage?.repository) {
        const registryUrl = repoImage.repository.registryUrl;
        
        // If the image name starts with the registry URL, remove it
        if (cleanName.startsWith(`${registryUrl}/`)) {
          cleanName = cleanName.substring(registryUrl.length + 1);
          wasFixed = true;
        }
      }
      
      // Also check for common registry patterns
      const registryPatterns = [
        /^localhost:\d+\//,
        /^127\.0\.0\.1:\d+\//,
        /^[^\/]+:\d+\//,  // Any host:port pattern
        /^https?:\/\/[^\/]+\//,  // HTTP(S) URLs
      ];
      
      for (const pattern of registryPatterns) {
        if (pattern.test(cleanName)) {
          cleanName = cleanName.replace(pattern, '');
          wasFixed = true;
          break;
        }
      }
      
      if (wasFixed) {
        console.log(`Fixing image: ${image.name} -> ${cleanName}`);
        
        // Update the image name
        await prisma.image.update({
          where: { id: image.id },
          data: { name: cleanName }
        });
        
        // Also update repository-image relationships
        for (const repoImage of image.repositoryImages) {
          await prisma.repositoryImage.update({
            where: { id: repoImage.id },
            data: { 
              imageName: cleanName,
              namespace: extractNamespace(cleanName)
            }
          });
        }
        
        fixedCount++;
      }
    }
    
    console.log(`Fixed ${fixedCount} images`);
    console.log('Image name cleanup complete!');
    
  } catch (error) {
    console.error('Error fixing image names:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

function extractNamespace(imageName) {
  const parts = imageName.split('/');
  return parts.length > 1 ? parts.slice(0, -1).join('/') : null;
}

// Run the script
fixImageNames().catch(console.error);