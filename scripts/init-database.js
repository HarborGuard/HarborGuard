#!/usr/bin/env node

const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

console.log('[DB] Starting PostgreSQL database initialization...');

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
 * Initialize PostgreSQL database
 */
async function initializeDatabase() {
  try {
    // Check if Prisma is available first
    const prismaAvailable = await checkPrismaAvailability();
    if (!prismaAvailable) {
      throw new Error('Prisma CLI is not available. Cannot initialize database.');
    }

    const databaseUrl = process.env.DATABASE_URL || 'postgresql://harborguard:harborguard@localhost:5432/harborguard?sslmode=disable';
    console.log('[DB] Using PostgreSQL database');
    console.log('[DB] Database URL:', databaseUrl.replace(/:[^:@]+@/, ':****@')); // Hide password

    // Generate Prisma client for PostgreSQL
    console.log('[DB] Generating Prisma client for PostgreSQL...');
    await execAsync('prisma generate', {
      env: { ...process.env, DATABASE_URL: databaseUrl }
    });

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

    console.log('[DB] PostgreSQL database initialized successfully');
    return { success: true };
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

module.exports = { initializeDatabase };