#!/bin/bash

# Database Initialization Script
# Initializes PostgreSQL database with fallback support

set -e  # Exit on any error

echo "[DB] Starting database initialization with fallback support..."

# Check if Prisma CLI is available
if command -v prisma &> /dev/null; then
    echo "[DB] Prisma CLI found"
else
    echo "[DB] ERROR: Prisma CLI not found. Please ensure Prisma is installed."
    echo "[DB] You can install it with: npm install -g prisma"
    exit 1
fi

# Check if DATABASE_URL is provided
if [ -z "$DATABASE_URL" ]; then
    echo "[DB] No external DATABASE_URL provided, will use bundled PostgreSQL"
    # The start.sh script will handle bundled PostgreSQL setup
    exit 0
fi

echo "[DB] External DATABASE_URL provided, testing connection..."

# Function to test PostgreSQL connection
test_postgresql_connection() {
    echo "[DB] Testing database connection..."
    if timeout 15s npx prisma db execute --sql "SELECT 1" 2>/dev/null; then
        return 0
    else
        return 1
    fi
}

# Test the external PostgreSQL connection
if test_postgresql_connection; then
    echo "[DB] Database connection successful"
    echo "[DB] Using external PostgreSQL database"
    echo "[DB] Database URL: ${DATABASE_URL//:*@/:****@}"  # Hide password
    
    # Run database migrations
    echo "[DB] Running database migrations..."
    if npx prisma migrate deploy; then
        echo "[DB] Migrations applied successfully"
    else
        echo "[DB] Migration failed, trying db push..."
        npx prisma db push --accept-data-loss
        echo "[DB] Database schema synchronized"
    fi
    
    echo "[DB] Database initialization completed successfully"
    echo "[DB] Using external PostgreSQL database"
else
    echo "[DB] ERROR: Failed to connect to external PostgreSQL database"
    echo "[DB] Please check your DATABASE_URL and ensure the database is accessible"
    exit 1
fi

echo "[DB] Initialization completed successfully"