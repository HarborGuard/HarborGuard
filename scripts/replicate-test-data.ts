import { PrismaClient } from '../src/generated/prisma'

const prisma = new PrismaClient()

async function replicateData() {
  try {
    console.log('Starting data replication...')
    
    // Get existing images and scans
    const existingImages = await prisma.image.findMany({
      include: {
        scans: true
      }
    })
    
    if (existingImages.length === 0) {
      console.log('No existing images found. Creating initial test data...')
      
      // Create initial test image if none exist
      const baseImage = await prisma.image.create({
        data: {
          name: 'nginx',
          tag: 'latest',
          digest: 'sha256:' + Math.random().toString(36).substring(2, 15),
          source: 'REGISTRY',
          platform: 'linux/amd64',
          sizeBytes: 150000000
        }
      })
      
      // Create a scan for the base image
      await prisma.scan.create({
        data: {
          requestId: `test-${Date.now()}`,
          imageId: baseImage.id,
          status: 'SUCCESS',
          source: 'test',
          startedAt: new Date(),
          finishedAt: new Date(),
          riskScore: Math.floor(Math.random() * 100)
        }
      })
      
      const imageWithScans = await prisma.image.findUnique({
        where: { id: baseImage.id },
        include: { scans: true }
      })
      if (imageWithScans) {
        existingImages.push(imageWithScans)
      }
    }
    
    console.log(`Found ${existingImages.length} existing images`)
    
    // Replicate each image 51 times
    for (let i = 1; i <= 51; i++) {
      console.log(`Creating replication batch ${i}/51...`)
      
      for (const originalImage of existingImages) {
        // Create new image with slightly different data
        const newImage = await prisma.image.create({
          data: {
            name: `${originalImage.name}-replica${i}`,
            tag: originalImage.tag || 'latest',
            digest: `sha256:${Math.random().toString(36).substring(2, 15)}${i}`,
            source: originalImage.source || 'REGISTRY',
            platform: originalImage.platform || 'linux/amd64',
            sizeBytes: originalImage.sizeBytes || 100000000
          }
        })
        
        // Create scans for the new image (replicate existing scans)
        if (originalImage.scans && originalImage.scans.length > 0) {
          for (const originalScan of originalImage.scans) {
            // First create metadata
            const metadata = await prisma.scanMetadata.create({
              data: {
                vulnerabilityCritical: Math.floor(Math.random() * 5),
                vulnerabilityHigh: Math.floor(Math.random() * 10),
                vulnerabilityMedium: Math.floor(Math.random() * 20),
                vulnerabilityLow: Math.floor(Math.random() * 30),
                vulnerabilityInfo: Math.floor(Math.random() * 40),
                complianceGrade: ['A', 'B', 'C', 'D', 'F'][Math.floor(Math.random() * 5)],
                complianceScore: Math.floor(Math.random() * 100)
              }
            })
            
            await prisma.scan.create({
              data: {
                requestId: `${originalScan.requestId}-replica${i}-${Date.now()}`,
                imageId: newImage.id,
                status: originalScan.status,
                source: originalScan.source || 'test',
                startedAt: new Date(),
                finishedAt: new Date(),
                riskScore: Math.floor(Math.random() * 100),
                metadataId: metadata.id
              }
            })
          }
        } else {
          // Create at least one scan for the new image
          const metadata = await prisma.scanMetadata.create({
            data: {
              vulnerabilityCritical: Math.floor(Math.random() * 5),
              vulnerabilityHigh: Math.floor(Math.random() * 10),
              vulnerabilityMedium: Math.floor(Math.random() * 20),
              vulnerabilityLow: Math.floor(Math.random() * 30),
              vulnerabilityInfo: Math.floor(Math.random() * 40),
              complianceGrade: ['A', 'B', 'C', 'D', 'F'][Math.floor(Math.random() * 5)],
              complianceScore: Math.floor(Math.random() * 100)
            }
          })
          
          await prisma.scan.create({
            data: {
              requestId: `test-scan-${i}-${Date.now()}`,
              imageId: newImage.id,
              status: 'SUCCESS',
              source: 'test',
              startedAt: new Date(),
              finishedAt: new Date(),
              riskScore: Math.floor(Math.random() * 100),
              metadataId: metadata.id
            }
          })
        }
      }
    }
    
    // Get final counts
    const totalImages = await prisma.image.count()
    const totalScans = await prisma.scan.count()
    
    console.log(`✅ Replication complete!`)
    console.log(`   Total images: ${totalImages}`)
    console.log(`   Total scans: ${totalScans}`)
    console.log(`   With 25 items per page, this creates ${Math.ceil(totalScans / 25)} pages`)
    
  } catch (error) {
    console.error('Error replicating data:', error)
  } finally {
    await prisma.$disconnect()
  }
}

replicateData()