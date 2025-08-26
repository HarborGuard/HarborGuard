#!/bin/bash

# Database Initialization Script
# Detects PostgreSQL vs SQLite and initializes accordingly with fallback support

set -e  # Exit on any error

echo "[DB] Starting database initialization..."

# Store original DATABASE_URL for fallback
ORIGINAL_DATABASE_URL="$DATABASE_URL"

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "[DB] No DATABASE_URL provided, using default SQLite"
    export DATABASE_URL="file:./dev.db"
    DB_TYPE="sqlite"
else
    echo "[DB] DATABASE_URL detected: $DATABASE_URL"
    
    # Detect database type from URL
    if [[ "$DATABASE_URL" == postgresql://* ]] || [[ "$DATABASE_URL" == postgres://* ]]; then
        DB_TYPE="postgresql"
    elif [[ "$DATABASE_URL" == file:* ]] || [[ "$DATABASE_URL" != *://* ]]; then
        DB_TYPE="sqlite"
    else
        echo "[DB] Unknown database type, falling back to SQLite"
        export DATABASE_URL="file:./dev.db"
        DB_TYPE="sqlite"
    fi
fi

echo "[DB] Detected database type: $DB_TYPE"

# Function to test PostgreSQL connection
test_postgresql_connection() {
    echo "[DB] Testing PostgreSQL connection..."
    if timeout 15s npx prisma db execute --sql "SELECT 1" 2>/dev/null; then
        return 0
    else
        return 1
    fi
}

# Function to initialize SQLite
initialize_sqlite() {
    echo "[DB] Initializing SQLite database..."
    
    # Ensure directory exists for SQLite file
    if [[ "$DATABASE_URL" == file:* ]]; then
        DB_FILE="${DATABASE_URL#file:}"
        DB_DIR="$(dirname "$DB_FILE")"
        mkdir -p "$DB_DIR"
        echo "[DB] Created directory for SQLite: $DB_DIR"
    fi
    
    # Run migrations for SQLite (schema supports both SQLite and PostgreSQL)
    npx prisma migrate deploy
    echo "[DB] SQLite database initialized successfully"
}

# Function to initialize PostgreSQL  
initialize_postgresql() {
    echo "[DB] Attempting to initialize PostgreSQL database..."
    
    # Test connection first
    if test_postgresql_connection; then
        echo "[DB] PostgreSQL connection successful"
        
        # For PostgreSQL, use db push to sync schema instead of migrations
        # This avoids SQLite-specific migration issues
        echo "[DB] Syncing schema to PostgreSQL database..."
        npx prisma db push --accept-data-loss
        echo "[DB] PostgreSQL database initialized successfully"
        return 0
    else
        echo "[DB] PostgreSQL connection failed"
        return 1
    fi
}

# Main initialization logic
if [ "$DB_TYPE" = "postgresql" ]; then
    # Try PostgreSQL first, fallback to SQLite if it fails
    if initialize_postgresql; then
        echo "[DB] Using PostgreSQL database"
        ACTIVE_DB_TYPE="postgresql"
    else
        echo "[DB] PostgreSQL initialization failed, falling back to SQLite..."
        echo "[DB] Warning: External database unavailable, using local SQLite"
        
        # Switch to SQLite fallback
        export DATABASE_URL="file:./dev.db"
        initialize_sqlite
        ACTIVE_DB_TYPE="sqlite"
    fi
else
    # Use SQLite directly
    initialize_sqlite
    ACTIVE_DB_TYPE="sqlite"
fi

# Generate Prisma client
echo "[DB] Generating Prisma client..."
npx prisma generate

echo "[DB] Database initialization complete"
echo "[DB] Active database type: $ACTIVE_DB_TYPE"
echo "[DB] Active database URL: $DATABASE_URL"

# Exit successfully
exit 0