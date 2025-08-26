#!/usr/bin/env node

const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

console.log('[DB] Starting database initialization...');

/**
 * Detect database provider from DATABASE_URL
 */
function detectDatabaseProvider() {
  const databaseUrl = process.env.DATABASE_URL || '';
  
  if (!databaseUrl) {
    console.log('[DB] No DATABASE_URL provided, using default SQLite');
    return { provider: 'sqlite', url: 'file:./dev.db', isExternal: false };
  }

  console.log('[DB] DATABASE_URL detected:', databaseUrl);

  if (databaseUrl.startsWith('postgresql://') || databaseUrl.startsWith('postgres://')) {
    return { provider: 'postgresql', url: databaseUrl, isExternal: true };
  }

  if (databaseUrl.startsWith('file:') || !databaseUrl.includes('://')) {
    return { provider: 'sqlite', url: databaseUrl, isExternal: false };
  }

  console.warn(`[DB] Unknown database provider in URL: ${databaseUrl}, falling back to SQLite`);
  return { provider: 'sqlite', url: 'file:./dev.db', isExternal: false };
}

/**
 * Test PostgreSQL connection
 */
async function testPostgreSQLConnection(url) {
  console.log('[DB] Testing PostgreSQL connection...');
  try {
    // For DigitalOcean and other managed PostgreSQL services, we need to handle SSL properly
    // Create a modified URL that works with Prisma's SSL requirements
    let modifiedUrl = url;
    
    // If the URL contains sslmode=require, we need to handle SSL certificate issues
    if (url.includes('sslmode=require')) {
      // For Prisma, we need to add sslaccept=accept_invalid_certs for DigitalOcean
      modifiedUrl = url.replace('sslmode=require', 'sslmode=require&sslaccept=accept_invalid_certs');
    }
    
    // Create a simple test SQL file
    const testSql = 'SELECT 1;';
    const fs = require('fs');
    const testFile = '/tmp/test-connection.sql';
    fs.writeFileSync(testFile, testSql);
    
    await execAsync(`npx prisma db execute --file "${testFile}" --url "${modifiedUrl}"`, {
      timeout: 15000,
      env: { ...process.env, DATABASE_URL: modifiedUrl }
    });
    
    // Clean up test file
    fs.unlinkSync(testFile);
    
    console.log('[DB] PostgreSQL connection successful');
    return true;
  } catch (error) {
    console.warn(`[DB] PostgreSQL connection failed: ${error.message}`);
    return false;
  }
}

/**
 * Update schema file provider
 */
function updateSchemaProvider(provider) {
  const schemaPath = 'prisma/schema.prisma';
  let schemaContent = fs.readFileSync(schemaPath, 'utf8');
  
  // Replace provider line
  schemaContent = schemaContent.replace(
    /provider\s*=\s*"(sqlite|postgresql)"/,
    `provider = "${provider}"`
  );
  
  fs.writeFileSync(schemaPath, schemaContent);
  console.log(`[DB] Updated schema provider to: ${provider}`);
}

/**
 * Initialize SQLite database
 */
async function initializeSQLite(url) {
  console.log('[DB] Initializing SQLite database...');
  
  // Ensure directory exists for SQLite file
  if (url.startsWith('file:')) {
    const dbFile = url.replace('file:', '');
    const dbDir = require('path').dirname(dbFile);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
      console.log(`[DB] Created directory for SQLite: ${dbDir}`);
    }
  }
  
  // Update schema to SQLite
  updateSchemaProvider('sqlite');
  
  // Run migrations for SQLite
  await execAsync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: url }
  });
  
  console.log('[DB] SQLite database initialized successfully');
}

/**
 * Initialize PostgreSQL database
 */
async function initializePostgreSQL(url) {
  console.log('[DB] Initializing PostgreSQL database...');
  
  // Update schema to PostgreSQL
  updateSchemaProvider('postgresql');
  
  // Use db push to sync schema (avoids migration issues)
  await execAsync('npx prisma db push --accept-data-loss', {
    env: { ...process.env, DATABASE_URL: url }
  });
  
  console.log('[DB] PostgreSQL database initialized successfully');
}

/**
 * Main initialization function
 */
async function initializeDatabase() {
  try {
    const config = detectDatabaseProvider();
    console.log(`[DB] Detected database type: ${config.provider}`);

    let activeProvider = config.provider;
    let activeUrl = config.url;

    if (config.isExternal) {
      // Test external database connection
      const connectionSuccess = await testPostgreSQLConnection(config.url);
      
      if (connectionSuccess) {
        await initializePostgreSQL(config.url);
      } else {
        console.warn('[DB] External database connection failed, falling back to SQLite');
        console.warn('[DB] Warning: External database unavailable, using local SQLite');
        
        // Fallback to SQLite
        activeProvider = 'sqlite';
        activeUrl = 'file:./dev.db';
        await initializeSQLite(activeUrl);
      }
    } else {
      // Initialize SQLite directly
      await initializeSQLite(config.url);
    }

    // Generate Prisma client
    console.log('[DB] Generating Prisma client...');
    await execAsync('npx prisma generate', {
      env: { ...process.env, DATABASE_URL: activeUrl }
    });

    console.log('[DB] Database initialization complete');
    console.log(`[DB] Active database type: ${activeProvider}`);
    console.log(`[DB] Active database URL: ${activeUrl}`);

    // Set the final DATABASE_URL for the application
    process.env.DATABASE_URL = activeUrl;
    
    return { success: true, provider: activeProvider, url: activeUrl };
  } catch (error) {
    console.error(`[DB] Database initialization failed: ${error.message}`);
    console.error(error.stack);
    return { success: false, error: error.message };
  }
}

// Run initialization if called directly
if (require.main === module) {
  initializeDatabase()
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
      console.error('[DB] Fatal error during initialization:', error);
      process.exit(1);
    });
}

module.exports = { initializeDatabase, detectDatabaseProvider };