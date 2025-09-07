import { NextRequest, NextResponse } from "next/server"
import { exec } from "child_process"
import { promisify } from "util"

const execAsync = promisify(exec)

export async function GET(req: NextRequest) {
  try {
    const { stdout } = await execAsync("docker version --format '{{.Server.Version}}'", {
      timeout: 5000
    })
    
    return NextResponse.json({
      available: true,
      version: stdout.trim()
    })
  } catch (error) {
    console.log("Docker not available:", error)
    return NextResponse.json({
      available: false,
      error: "Docker is not available on this system"
    })
  }
}