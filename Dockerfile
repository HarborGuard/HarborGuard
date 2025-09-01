# ---- 1) Build Next.js ----
FROM node:20-alpine AS builder
WORKDIR /app

RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./
RUN npm ci --ignore-scripts

COPY . .
RUN npx prisma generate
# Generate static OpenAPI spec before build
RUN npm run generate:openapi || true
RUN npm run build:docker

# ---- 2) Runtime + scanners + PostgreSQL ----
FROM node:20-alpine AS runtime
WORKDIR /app

ARG TARGETARCH=amd64
ARG TRIVY_VERSION=v0.65.0
ARG DOCKLE_VERSION=0.4.15
ARG OSV_SCANNER_VERSION=v2.2.2
ARG DIVE_VERSION=0.13.1

# Install Prisma CLI only (minimal size)
RUN npm install -g prisma@6.14.0 --no-save

# Install PostgreSQL 16
RUN apk add --no-cache \
    postgresql16 \
    postgresql16-client \
    postgresql16-contrib \
    ca-certificates skopeo curl tar gzip xz gnupg docker-cli \
  && set -eux \
  # Install Trivy
  && curl -sSfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin "${TRIVY_VERSION}" \
  # Install Grype
  && curl -fsSL https://get.anchore.io/grype | sh -s -- -b /usr/local/bin \
  # Install Syft
  && curl -sSfL https://get.anchore.io/syft | sh -s -- -b /usr/local/bin \
  # Install OSV Scanner
  && curl -L "https://github.com/google/osv-scanner/releases/download/${OSV_SCANNER_VERSION}/osv-scanner_linux_${TARGETARCH}" -o /usr/local/bin/osv-scanner \
  && chmod +x /usr/local/bin/osv-scanner \
  # Install Dive
  && curl -L "https://github.com/wagoodman/dive/releases/download/v${DIVE_VERSION}/dive_${DIVE_VERSION}_linux_${TARGETARCH}.tar.gz" -o /tmp/dive.tgz \
  && tar -xzf /tmp/dive.tgz -C /usr/local/bin dive \
  && rm /tmp/dive.tgz \
  # Install dockle
  && if [ "$TARGETARCH" = "amd64" ]; then \
        DOCKLE_ARCH=64bit; \
     else \
        DOCKLE_ARCH=ARM64; \
     fi \
  && curl -L "https://github.com/goodwithtech/dockle/releases/download/v${DOCKLE_VERSION}/dockle_${DOCKLE_VERSION}_Linux-${DOCKLE_ARCH}.tar.gz" \
       -o /tmp/dockle.tgz \
  && tar -xzf /tmp/dockle.tgz -C /usr/local/bin dockle \
  && rm /tmp/dockle.tgz \
  && chmod +x /usr/local/bin/dockle \
  && rm -rf /var/cache/apk/* /tmp/* /var/tmp/*

ENV TRIVY_CACHE_DIR=/opt/trivy-cache \
    GRYPE_DB_CACHE_DIR=/opt/grype-cache \
    SYFT_CACHE_DIR=/opt/syft-cache
RUN mkdir -p "$TRIVY_CACHE_DIR" "$GRYPE_DB_CACHE_DIR" "$SYFT_CACHE_DIR"

RUN mkdir -p /workspace && chown node:node /workspace

# Setup PostgreSQL
RUN mkdir -p /var/lib/postgresql/data /run/postgresql && \
    chown -R postgres:postgres /var/lib/postgresql /run/postgresql && \
    chmod 700 /var/lib/postgresql/data

ENV NODE_ENV=production
ENV PGDATA=/var/lib/postgresql/data

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src/generated ./src/generated
COPY --from=builder /app/scripts ./scripts

ENV PORT=3000
# Default PostgreSQL settings for bundled database (used only if DATABASE_URL is not provided)
ENV POSTGRES_USER=harborguard
ENV POSTGRES_PASSWORD=harborguard
ENV POSTGRES_DB=harborguard

# Create startup script
RUN echo '#!/bin/sh' > /start.sh && \
    echo 'set -e' >> /start.sh && \
    echo '' >> /start.sh && \
    echo '# Check if external DATABASE_URL is provided' >> /start.sh && \
    echo 'if [ -z "$DATABASE_URL" ] || [ "$DATABASE_URL" = "postgresql://harborguard:harborguard@localhost:5432/harborguard?sslmode=disable" ]; then' >> /start.sh && \
    echo '  echo "No external DATABASE_URL provided, using bundled PostgreSQL"' >> /start.sh && \
    echo '  USE_BUNDLED_PG=true' >> /start.sh && \
    echo '  export DATABASE_URL="postgresql://harborguard:harborguard@localhost:5432/harborguard?sslmode=disable"' >> /start.sh && \
    echo 'else' >> /start.sh && \
    echo '  echo "External DATABASE_URL provided, will attempt to connect"' >> /start.sh && \
    echo '  USE_BUNDLED_PG=false' >> /start.sh && \
    echo 'fi' >> /start.sh && \
    echo '' >> /start.sh && \
    echo '# Start bundled PostgreSQL if needed' >> /start.sh && \
    echo 'if [ "$USE_BUNDLED_PG" = "true" ]; then' >> /start.sh && \
    echo '  # Initialize PostgreSQL if needed' >> /start.sh && \
    echo '  if [ ! -s "$PGDATA/PG_VERSION" ]; then' >> /start.sh && \
    echo '    echo "Initializing bundled PostgreSQL database..."' >> /start.sh && \
    echo '    su - postgres -c "initdb -D $PGDATA --auth-local=trust --auth-host=scram-sha-256"' >> /start.sh && \
    echo '    echo "host all all 127.0.0.1/32 trust" >> $PGDATA/pg_hba.conf' >> /start.sh && \
    echo '    echo "host all all ::1/128 trust" >> $PGDATA/pg_hba.conf' >> /start.sh && \
    echo '  fi' >> /start.sh && \
    echo '  ' >> /start.sh && \
    echo '  # Start PostgreSQL' >> /start.sh && \
    echo '  echo "Starting bundled PostgreSQL..."' >> /start.sh && \
    echo '  su - postgres -c "pg_ctl -D $PGDATA -l /var/lib/postgresql/logfile start"' >> /start.sh && \
    echo '  sleep 3' >> /start.sh && \
    echo '  ' >> /start.sh && \
    echo '  # Create database and user if needed' >> /start.sh && \
    echo '  su - postgres -c "psql -tc \"SELECT 1 FROM pg_user WHERE usename = '"'"'harborguard'"'"'\" | grep -q 1 || psql -c \"CREATE USER harborguard WITH PASSWORD '"'"'harborguard'"'"';\""' >> /start.sh && \
    echo '  su - postgres -c "psql -tc \"SELECT 1 FROM pg_database WHERE datname = '"'"'harborguard'"'"'\" | grep -q 1 || psql -c \"CREATE DATABASE harborguard OWNER harborguard;\""' >> /start.sh && \
    echo 'fi' >> /start.sh && \
    echo '' >> /start.sh && \
    echo '# Initialize database schema with fallback' >> /start.sh && \
    echo 'echo "Initializing database schema..."' >> /start.sh && \
    echo 'node scripts/init-database-with-fallback.js' >> /start.sh && \
    echo '' >> /start.sh && \
    echo '# Start the application' >> /start.sh && \
    echo 'echo "Starting HarborGuard..."' >> /start.sh && \
    echo 'exec node server.js' >> /start.sh && \
    chmod +x /start.sh

USER root
EXPOSE 3000 5432

# Health check using the /api/health endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:${PORT:-3000}/api/health || exit 1

CMD ["/start.sh"]
