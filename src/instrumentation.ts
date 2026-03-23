export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { scheduleAutoCleanup } = await import('./lib/cleanup');
    scheduleAutoCleanup();
    await bootstrapAgentKey();
    await initializeDemoMode();
  }
}

async function bootstrapAgentKey() {
  const bootstrapKey = process.env.HG_API_KEY;
  if (!bootstrapKey || !bootstrapKey.startsWith('hg_ak_')) return;

  try {
    const crypto = await import('crypto');
    const { prisma } = await import('./lib/prisma');

    const hash = crypto.createHash('sha256').update(bootstrapKey).digest('hex');

    // Skip if an agent with this key already exists
    const existing = await prisma.agent.findFirst({ where: { apiKeyHash: hash } });
    if (existing) return;

    await prisma.agent.create({
      data: {
        name: 'bootstrap-sensor',
        apiKeyHash: hash,
        status: 'DISCONNECTED',
        capabilities: ['scan'],
      },
    });
    console.log('[bootstrap] Auto-registered agent from HG_API_KEY');
  } catch (error) {
    console.warn('[bootstrap] Failed to seed agent key:', error);
  }
}

async function initializeDemoMode() {
  // Check if demo mode is enabled
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== 'true') {
    return;
  }

  console.log('🎭 Demo mode detected - initializing with sample scan');

  // Wait a bit for the server to fully start up
  setTimeout(async () => {
    try {
      // Trigger a scan of nginx:latest from Docker Hub
      const baseUrl = process.env.HOSTNAME 
        ? `http://${process.env.HOSTNAME}:3000`
        : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');
      
      console.log('🚀 Starting demo scan: nginx:latest');
      
      const response = await fetch(`${baseUrl}/api/scans/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image: 'nginx',
          tag: 'latest',
          source: 'registry',
          registryType: 'DOCKERHUB',  // Explicitly specify Docker Hub
          registry: 'docker.io',       // Provide the registry URL
        }),
      });

      if (response.ok) {
        const result = await response.json();
        console.log('✅ Demo scan started successfully:', result.requestId);
      } else {
        console.warn('⚠️ Demo scan failed to start:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('❌ Error starting demo scan:', error);
    }
  }, 5000); // Wait 5 seconds for server to be ready
}