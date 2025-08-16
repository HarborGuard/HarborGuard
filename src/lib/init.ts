import { schedulerService } from './scheduler/SchedulerService';
import { scanTemplateService } from './templates/ScanTemplateService';

let initialized = false;

export async function initializeServices(): Promise<void> {
  if (initialized) {
    return;
  }

  console.log('Initializing HarborGuard services...');

  try {
    // Initialize scan templates
    await scanTemplateService.initializeDefaultTemplates();

    // Initialize scheduled scans
    await schedulerService.initializeSchedules();

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
      // Stop all scheduled scans
      schedulerService.destroy();
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