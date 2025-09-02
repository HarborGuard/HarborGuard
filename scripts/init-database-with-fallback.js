#!/usr/bin/env node

const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

console.log('[DB] Starting database initialization with fallback support...');

/**
 * Check if Prisma CLI is available
 */
async function checkPrismaAvailability() {
  try {
    await execAsync('which prisma || command -v prisma');
    console.log('[DB] Prisma CLI found');
    return true;
  } catch (error) {
    console.error('[DB] ERROR: Prisma CLI not found. Please ensure Prisma is installed.');
    console.error('[DB] You can install it with: npm install -g prisma');
    return false;
  }
}

/**
 * Test database connection
 */
async function testDatabaseConnection(databaseUrl) {
  try {
    console.log('[DB] Testing database connection...');
    
    // Create a simple test SQL
    const fs = require('fs');
    const testSql = 'SELECT 1;';
    const testFile = '/tmp/test-connection.sql';
    fs.writeFileSync(testFile, testSql);
    
    // Try to execute a simple query
    await execAsync(`prisma db execute --file "${testFile}" --url "${databaseUrl}"`, {
      timeout: 10000,
      env: { ...process.env, DATABASE_URL: databaseUrl }
    });
    
    // Clean up test file
    fs.unlinkSync(testFile);
    
    console.log('[DB] Database connection successful');
    return true;
  } catch (error) {
    console.log(`[DB] Database connection failed: ${error.message}`);
    return false;
  }
}

/**
 * Start bundled PostgreSQL
 */
async function startBundledPostgreSQL() {
  try {
    console.log('[DB] Starting bundled PostgreSQL...');
    
    const pgData = process.env.PGDATA || '/var/lib/postgresql/data';
    const pgUser = process.env.POSTGRES_USER || 'harborguard';
    const pgPassword = process.env.POSTGRES_PASSWORD || 'harborguard';
    const pgDatabase = process.env.POSTGRES_DB || 'harborguard';
    
    // Check if PostgreSQL is already initialized
    const fs = require('fs');
    if (!fs.existsSync(`${pgData}/PG_VERSION`)) {
      console.log('[DB] Initializing bundled PostgreSQL...');
      await execAsync(`su - postgres -c "initdb -D ${pgData} --auth-local=trust --auth-host=scram-sha-256"`);
      await execAsync(`echo "host all all 127.0.0.1/32 trust" >> ${pgData}/pg_hba.conf`);
      await execAsync(`echo "host all all ::1/128 trust" >> ${pgData}/pg_hba.conf`);
    }
    
    // Check if PostgreSQL is already running
    try {
      await execAsync('su - postgres -c "pg_ctl status -D $PGDATA"');
      console.log('[DB] Bundled PostgreSQL is already running');
    } catch {
      // Start PostgreSQL
      console.log('[DB] Starting bundled PostgreSQL server...');
      await execAsync('su - postgres -c "pg_ctl -D $PGDATA -l /var/lib/postgresql/logfile start"');
      await execAsync('sleep 3'); // Wait for PostgreSQL to start
    }
    
    // Create user and database if needed - using environment variables
    await execAsync(`su - postgres -c "psql -tc \\"SELECT 1 FROM pg_user WHERE usename = '${pgUser}'\\" | grep -q 1 || psql -c \\"CREATE USER ${pgUser} WITH PASSWORD '${pgPassword}';\\"" || true`);
    await execAsync(`su - postgres -c "psql -tc \\"SELECT 1 FROM pg_database WHERE datname = '${pgDatabase}'\\" | grep -q 1 || psql -c \\"CREATE DATABASE ${pgDatabase} OWNER ${pgUser};\\"" || true`);
    
    return `postgresql://${pgUser}:${pgPassword}@localhost:5432/${pgDatabase}?sslmode=disable`;
  } catch (error) {
    console.error(`[DB] Failed to start bundled PostgreSQL: ${error.message}`);
    throw error;
  }
}

/**
 * Initialize database with schema
 */
async function initializeDatabase(databaseUrl) {
  try {
    console.log('[DB] Database URL:', databaseUrl.replace(/:[^:@]+@/, ':****@')); // Hide password

    
    // Run migrations
    console.log('[DB] Running database migrations...');
    try {
      await execAsync('prisma migrate deploy', {
        env: { ...process.env, DATABASE_URL: databaseUrl },
        timeout: 30000
      });
      console.log('[DB] Migrations applied successfully');
    } catch (migrateError) {
      // If migrations fail, try db push as fallback
      console.log('[DB] Migration failed, trying db push...');
      await execAsync('prisma db push --accept-data-loss', {
        env: { ...process.env, DATABASE_URL: databaseUrl },
        timeout: 30000
      });
      console.log('[DB] Database schema synchronized');
    }
    
    return true;
  } catch (error) {
    console.error(`[DB] Database initialization failed: ${error.message}`);
    return false;
  }
}

/**
 * Main initialization function with fallback
 */
async function initializeWithFallback() {
  try {
    // Check if Prisma is available first
    const prismaAvailable = await checkPrismaAvailability();
    if (!prismaAvailable) {
      throw new Error('Prisma CLI is not available. Cannot initialize database.');
    }
    
    let databaseUrl = process.env.DATABASE_URL;
    let usingBundled = false;
    
    // Check if DATABASE_URL is provided and valid
    if (databaseUrl && databaseUrl !== '') {
      console.log('[DB] External DATABASE_URL provided, testing connection...');
      
      // Test the external database connection
      const connectionSuccess = await testDatabaseConnection(databaseUrl);
      
      if (!connectionSuccess) {
        console.log('[DB] External database connection failed, falling back to bundled PostgreSQL');
        databaseUrl = await startBundledPostgreSQL();
        usingBundled = true;
      } else {
        console.log('[DB] Using external PostgreSQL database');
      }
    } else {
      console.log('[DB] No external DATABASE_URL provided, using bundled PostgreSQL');
      databaseUrl = await startBundledPostgreSQL();
      usingBundled = true;
    }
    
    // Set the DATABASE_URL for the application
    process.env.DATABASE_URL = databaseUrl;
    
    // Initialize the database schema
    const initSuccess = await initializeDatabase(databaseUrl);
    
    if (!initSuccess) {
      throw new Error('Failed to initialize database schema');
    }
    
    console.log('[DB] Database initialization completed successfully');
    console.log(`[DB] Using ${usingBundled ? 'bundled' : 'external'} PostgreSQL database`);
    
    return { success: true, usingBundled, databaseUrl };
  } catch (error) {
    console.error(`[DB] Fatal error during initialization: ${error.message}`);
    console.error(error.stack);
    return { success: false, error: error.message };
  }
}

// Run initialization if called directly
if (require.main === module) {
  initializeWithFallback()
    .then((result) => {
      if (result.success) {
        console.log('[DB] Initialization completed successfully');
        process.exit(0);
      } else {
        console.error('[DB] Initialization failed');
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error('[DB] Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { initializeWithFallback };