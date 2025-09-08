import { NextResponse } from 'next/server';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

export async function GET() {
  try {
    // Try to ping Docker daemon
    await execAsync('docker info', { timeout: 5000 });
    
    return NextResponse.json({
      available: true,
      message: 'Docker daemon is available'
    });
  } catch (error) {
    return NextResponse.json({
      available: false,
      message: 'Docker daemon is not available'
    });
  }
}