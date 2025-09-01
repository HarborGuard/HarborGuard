import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface DatabaseConfig {
  provider: 'postgresql';
  url: string;
  isExternal: boolean;
}

/**
 * Detect database provider from DATABASE_URL environment variable
 */
export function detectDatabaseProvider(): DatabaseConfig {
  const databaseUrl = process.env.DATABASE_URL || '';
  
  // Default PostgreSQL configuration for bundled database
  const defaultConfig: DatabaseConfig = {
    provider: 'postgresql',
    url: 'postgresql://harborguard:harborguard@localhost:5432/harborguard?sslmode=disable',
    isExternal: false
  };

  if (!databaseUrl) {
    console.log('[DB] No DATABASE_URL provided, using bundled PostgreSQL');
    return defaultConfig;
  }

  // PostgreSQL detection
  if (databaseUrl.startsWith('postgresql://') || databaseUrl.startsWith('postgres://')) {
    return {
      provider: 'postgresql',
      url: databaseUrl,
      isExternal: true
    };
  }

  // Unknown provider, fall back to bundled PostgreSQL
  console.warn(`[DB] Unknown database provider in URL: ${databaseUrl}, using bundled PostgreSQL`);
  return defaultConfig;
}

/**
 * Test database connection with timeout
 */
export async function testDatabaseConnection(config: DatabaseConfig): Promise<{ success: boolean; error?: string }> {
  if (!config.isExternal) {
    // Bundled PostgreSQL is assumed to be available
    return { success: true };
  }

  try {
    console.log('[DB] Testing PostgreSQL connection...');
    
    // Use Prisma to test connection
    const { stdout, stderr } = await execAsync('npx prisma db execute --sql "SELECT 1"', {
      timeout: 10000,
      env: { ...process.env, DATABASE_URL: config.url }
    });

    if (stderr && !stderr.includes('Prisma')) {
      throw new Error(stderr);
    }

    console.log('[DB] PostgreSQL connection successful');
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn(`[DB] PostgreSQL connection failed: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}

/**
 * Get the appropriate DATABASE_URL for runtime based on connection test
 */
export async function getActiveDatabaseUrl(): Promise<string> {
  const config = detectDatabaseProvider();
  
  if (!config.isExternal) {
    // Bundled PostgreSQL - return as is
    return config.url;
  }

  // Test external database connection
  const connectionTest = await testDatabaseConnection(config);
  
  if (connectionTest.success) {
    console.log('[DB] Using external PostgreSQL database');
    return config.url;
  } else {
    console.warn('[DB] External database connection failed, falling back to bundled PostgreSQL');
    console.warn(`[DB] Error: ${connectionTest.error}`);
    return 'postgresql://harborguard:harborguard@localhost:5432/harborguard?sslmode=disable';
  }
}

/**
 * Initialize database based on provider and connection status
 */
export async function initializeDatabase(): Promise<{ provider: string; success: boolean; error?: string }> {
  try {
    const config = detectDatabaseProvider();
    console.log(`[DB] Initializing database with provider: ${config.provider}`);

    if (config.isExternal) {
      // Test external database first
      const connectionTest = await testDatabaseConnection(config);
      
      if (connectionTest.success) {
        // Run migrations for external database
        console.log('[DB] Running migrations for external database...');
        await execAsync('npx prisma migrate deploy', {
          env: { ...process.env, DATABASE_URL: config.url }
        });
        
        console.log('[DB] External database initialized successfully');
        return { provider: config.provider, success: true };
      } else {
        console.warn('[DB] External database failed, initializing bundled PostgreSQL fallback...');
        
        // Initialize bundled PostgreSQL fallback
        await execAsync('npx prisma migrate deploy', {
          env: { ...process.env, DATABASE_URL: 'postgresql://harborguard:harborguard@localhost:5432/harborguard?sslmode=disable' }
        });
        
        console.log('[DB] Bundled PostgreSQL fallback initialized successfully');
        return { provider: 'postgresql', success: true };
      }
    } else {
      // Initialize bundled PostgreSQL
      console.log('[DB] Initializing bundled PostgreSQL database...');
      await execAsync('npx prisma migrate deploy', {
        env: { ...process.env, DATABASE_URL: config.url }
      });
      
      console.log('[DB] Bundled PostgreSQL database initialized successfully');
      return { provider: 'postgresql', success: true };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[DB] Database initialization failed: ${errorMessage}`);
    return { provider: 'unknown', success: false, error: errorMessage };
  }
}