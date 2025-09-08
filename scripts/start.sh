#!/bin/bash
set -e

echo "Starting HarborGuard..."

# Check if running in privileged mode (for buildah features)
if [ -f /usr/sbin/capsh ]; then
    if ! capsh --print | grep -q cap_sys_admin; then
        echo "WARNING: Container is not running in privileged mode."
        echo "Buildah patching features will not work without --privileged flag."
        echo "Scanning features will still work normally."
    fi
else
    # Alternative check using /proc
    if ! grep -q "CapEff:.*00000000a80425fb" /proc/1/status 2>/dev/null; then
        echo "WARNING: Container may not be running in privileged mode."
        echo "Buildah patching features require --privileged flag."
    fi
fi

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
    su-exec postgres initdb -D $PGDATA --auth-local=trust --auth-host=scram-sha-256
    echo "host all all 0.0.0.0/0 trust" >> $PGDATA/pg_hba.conf
    echo "listen_addresses='*'" >> $PGDATA/postgresql.conf
  fi
  
  # Start PostgreSQL
  echo "Starting bundled PostgreSQL..."
  su-exec postgres pg_ctl -D $PGDATA -l /var/lib/postgresql/logfile start
  
  # Wait for PostgreSQL to be ready
  echo "Waiting for PostgreSQL to start..."
  for i in {1..30}; do
    if su-exec postgres pg_isready -q; then
      break
    fi
    sleep 1
  done
  
  # Create database and user if needed
  su-exec postgres psql -tc "SELECT 1 FROM pg_user WHERE usename = '$POSTGRES_USER'" | grep -q 1 || \
    su-exec postgres psql -c "CREATE USER $POSTGRES_USER WITH PASSWORD '$POSTGRES_PASSWORD';"
  su-exec postgres psql -tc "SELECT 1 FROM pg_database WHERE datname = '$POSTGRES_DB'" | grep -q 1 || \
    su-exec postgres psql -c "CREATE DATABASE $POSTGRES_DB OWNER $POSTGRES_USER;"
fi

# Run database migrations
echo "Running database migrations..."
npx prisma migrate deploy || true

# For buildah to work properly in privileged mode
if [ -e /dev/fuse ]; then
    chmod 666 /dev/fuse || true
fi

# Ensure buildah can use overlay
export STORAGE_DRIVER=overlay
export BUILDAH_ISOLATION=chroot

# Start the application
echo "Starting HarborGuard application..."
export HOSTNAME=0.0.0.0
exec node server.js