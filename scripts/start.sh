#!/bin/sh
set -e

# Check if external DATABASE_URL is provided
if [ -z "$DATABASE_URL" ]; then
  echo "No external DATABASE_URL provided, using bundled PostgreSQL"
  USE_BUNDLED_PG=true
  # Use a fixed password for bundled PostgreSQL for simplicity
  # In production, this should be generated or provided via environment
  export POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-harborguard}
  # Set default values if not provided
  export POSTGRES_USER=${POSTGRES_USER:-harborguard}
  export POSTGRES_DB=${POSTGRES_DB:-harborguard}
  export DATABASE_URL="postgresql://$POSTGRES_USER:$POSTGRES_PASSWORD@localhost:5432/$POSTGRES_DB?sslmode=disable"
else
  echo "External DATABASE_URL provided, will attempt to connect"
  USE_BUNDLED_PG=false
fi

# Start bundled PostgreSQL if needed
if [ "$USE_BUNDLED_PG" = "true" ]; then
  # Initialize PostgreSQL if needed
  if [ ! -s "$PGDATA/PG_VERSION" ]; then
    echo "Initializing bundled PostgreSQL database..."
    su - postgres -c "initdb -D $PGDATA --auth-local=trust --auth-host=scram-sha-256"
    echo "host all all 127.0.0.1/32 trust" >> $PGDATA/pg_hba.conf
    echo "host all all ::1/128 trust" >> $PGDATA/pg_hba.conf
  fi
  
  # Start PostgreSQL
  echo "Starting bundled PostgreSQL..."
  su - postgres -c "pg_ctl -D $PGDATA -l /var/lib/postgresql/logfile start"
  sleep 3
  
  # Create database and user if needed
  su - postgres -c "psql -tc \"SELECT 1 FROM pg_user WHERE usename = '$POSTGRES_USER'\" | grep -q 1 || psql -c \"CREATE USER $POSTGRES_USER WITH PASSWORD '$POSTGRES_PASSWORD';\""
  su - postgres -c "psql -tc \"SELECT 1 FROM pg_database WHERE datname = '$POSTGRES_DB'\" | grep -q 1 || psql -c \"CREATE DATABASE $POSTGRES_DB OWNER $POSTGRES_USER;\""
fi

# Initialize database schema with fallback
echo "Initializing database schema..."
node scripts/init-database-with-fallback.js

# Start the application
echo "Starting HarborGuard..."
exec node server.js