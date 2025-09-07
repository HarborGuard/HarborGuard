import { NextRequest, NextResponse } from "next/server"
import { exec } from "child_process"
import { promisify } from "util"
import * as fs from "fs/promises"
import * as path from "path"

const execAsync = promisify(exec)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { imageName, imageTag, action, targetRegistry, targetTag } = body

    if (!imageName || !imageTag) {
      return NextResponse.json(
        { error: "Image name and tag are required" },
        { status: 400 }
      )
    }

    const sourceImage = `${imageName}:${imageTag}`
    
    if (action === "tag") {
      // Tag image locally
      const tagCommand = `docker tag ${sourceImage} ${targetTag}`
      console.log(`Executing: ${tagCommand}`)
      
      try {
        await execAsync(tagCommand)
        return NextResponse.json({
          success: true,
          message: `Image tagged as ${targetTag}`,
          targetImage: targetTag
        })
      } catch (error: any) {
        console.error("Failed to tag image:", error)
        return NextResponse.json(
          { error: `Failed to tag image: ${error.message}` },
          { status: 500 }
        )
      }
    } else if (action === "push") {
      // Push to registry
      if (!targetRegistry) {
        return NextResponse.json(
          { error: "Target registry is required for push" },
          { status: 400 }
        )
      }

      const targetImage = `${targetRegistry}/${imageName}:${targetTag || imageTag}`
      
      try {
        // First tag the image with the target registry
        const tagCommand = `docker tag ${sourceImage} ${targetImage}`
        console.log(`Tagging: ${tagCommand}`)
        await execAsync(tagCommand)
        
        // Then push to the registry
        const pushCommand = `docker push ${targetImage}`
        console.log(`Pushing: ${pushCommand}`)
        const { stdout, stderr } = await execAsync(pushCommand, {
          timeout: 300000 // 5 minutes timeout for push
        })
        
        return NextResponse.json({
          success: true,
          message: `Image pushed to ${targetRegistry}`,
          targetImage,
          output: stdout || stderr
        })
      } catch (error: any) {
        console.error("Failed to push image:", error)
        return NextResponse.json(
          { error: `Failed to push image: ${error.message}` },
          { status: 500 }
        )
      }
    } else if (action === "load-and-push") {
      // Load from TAR and push (for patched images)
      const { tarPath } = body
      
      if (!tarPath) {
        return NextResponse.json(
          { error: "TAR path is required for load-and-push" },
          { status: 400 }
        )
      }

      try {
        // Check if TAR file exists
        await fs.access(tarPath)
        
        // Load the TAR file
        const loadCommand = `docker load -i ${tarPath}`
        console.log(`Loading: ${loadCommand}`)
        const loadResult = await execAsync(loadCommand)
        
        // Extract the loaded image ID/name
        const imageIdMatch = loadResult.stdout.match(/Loaded image:\s*(.+)/)
        if (!imageIdMatch) {
          throw new Error("Failed to extract loaded image ID")
        }
        
        const loadedImage = imageIdMatch[1]
        const targetImage = `${targetRegistry}/${imageName}:${targetTag || imageTag}`
        
        // Tag the loaded image
        const tagCommand = `docker tag ${loadedImage} ${targetImage}`
        console.log(`Tagging: ${tagCommand}`)
        await execAsync(tagCommand)
        
        // Push to registry
        const pushCommand = `docker push ${targetImage}`
        console.log(`Pushing: ${pushCommand}`)
        const { stdout, stderr } = await execAsync(pushCommand, {
          timeout: 300000
        })
        
        return NextResponse.json({
          success: true,
          message: `Image loaded from TAR and pushed to ${targetRegistry}`,
          targetImage,
          output: stdout || stderr
        })
      } catch (error: any) {
        console.error("Failed to load and push image:", error)
        return NextResponse.json(
          { error: `Failed to load and push image: ${error.message}` },
          { status: 500 }
        )
      }
    } else {
      return NextResponse.json(
        { error: "Invalid action. Use 'tag', 'push', or 'load-and-push'" },
        { status: 400 }
      )
    }
  } catch (error: any) {
    console.error("Export error:", error)
    return NextResponse.json(
      { error: error.message || "Failed to export image" },
      { status: 500 }
    )
  }
}