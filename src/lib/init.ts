let initialized = false;

export async function initializeServices(): Promise<void> {
  if (initialized) {
    return;
  }

  console.log('Initializing HarborGuard services...');

  try {
    // Services initialization is now handled by individual components as needed
    initialized = true;
    console.log('HarborGuard services initialized successfully');

  } catch (error) {
    console.error('Failed to initialize services:', error);
    throw error;
  }
}

// Graceful shutdown handler
export function setupGracefulShutdown(): void {
  const cleanup = () => {
    console.log('Shutting down HarborGuard services...');
    
    try {
      console.log('Services shut down successfully');
    } catch (error) {
      console.error('Error during shutdown:', error);
    }
    
    process.exit(0);
  };

  // Handle different shutdown signals
  process.on('SIGTERM', cleanup);
  process.on('SIGINT', cleanup);
  process.on('SIGUSR1', cleanup);
  process.on('SIGUSR2', cleanup);
  
  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    cleanup();
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled rejection at:', promise, 'reason:', reason);
    cleanup();
  });
}