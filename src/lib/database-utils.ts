import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface DatabaseConfig {
  provider: 'postgresql' | 'sqlite';
  url: string;
  isExternal: boolean;
}

/**
 * Detect database provider from DATABASE_URL environment variable
 */
export function detectDatabaseProvider(): DatabaseConfig {
  const databaseUrl = process.env.DATABASE_URL || '';
  
  // Default SQLite configuration
  const defaultConfig: DatabaseConfig = {
    provider: 'sqlite',
    url: 'file:./dev.db',
    isExternal: false
  };

  if (!databaseUrl) {
    console.log('[DB] No DATABASE_URL provided, using default SQLite');
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

  // SQLite detection
  if (databaseUrl.startsWith('file:') || (!databaseUrl.includes('://'))) {
    return {
      provider: 'sqlite',
      url: databaseUrl,
      isExternal: false
    };
  }

  // MySQL/MariaDB detection (future support)
  if (databaseUrl.startsWith('mysql://')) {
    console.warn('[DB] MySQL detected but not fully supported yet, falling back to SQLite');
    return defaultConfig;
  }

  // Unknown provider, fall back to SQLite
  console.warn(`[DB] Unknown database provider in URL: ${databaseUrl}, falling back to SQLite`);
  return defaultConfig;
}

/**
 * Test database connection with timeout
 */
export async function testDatabaseConnection(config: DatabaseConfig): Promise<{ success: boolean; error?: string }> {
  if (!config.isExternal) {
    // SQLite doesn't need connection testing
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
    // SQLite - return as is
    return config.url;
  }

  // Test external database connection
  const connectionTest = await testDatabaseConnection(config);
  
  if (connectionTest.success) {
    console.log('[DB] Using external PostgreSQL database');
    return config.url;
  } else {
    console.warn('[DB] External database connection failed, falling back to SQLite');
    console.warn(`[DB] Error: ${connectionTest.error}`);
    return 'file:./dev.db';
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
        console.warn('[DB] External database failed, initializing SQLite fallback...');
        
        // Initialize SQLite fallback
        await execAsync('npx prisma migrate deploy', {
          env: { ...process.env, DATABASE_URL: 'file:./dev.db' }
        });
        
        console.log('[DB] SQLite fallback initialized successfully');
        return { provider: 'sqlite', success: true };
      }
    } else {
      // Initialize SQLite
      console.log('[DB] Initializing SQLite database...');
      await execAsync('npx prisma migrate deploy', {
        env: { ...process.env, DATABASE_URL: config.url }
      });
      
      console.log('[DB] SQLite database initialized successfully');
      return { provider: 'sqlite', success: true };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[DB] Database initialization failed: ${errorMessage}`);
    return { provider: 'unknown', success: false, error: errorMessage };
  }
}