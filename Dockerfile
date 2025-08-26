# ---- 1) Build Next.js ----
FROM node:20-alpine AS builder
WORKDIR /app

# Install minimal build dependencies
RUN apk add --no-cache python3 make g++

# Install deps separately for better caching
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./
RUN npm ci --ignore-scripts

# Build
COPY . .
RUN npx prisma generate
RUN npm run build

# ---- 2) Runtime + scanners (optimized) ----
FROM node:20-alpine AS runtime
WORKDIR /app

# Pin versions
ARG TRIVY_VERSION=v0.56.2
ARG GRYPE_VERSION=v0.78.1
ARG SYFT_VERSION=v1.4.1
ARG DOCKLE_VERSION=v0.4.15

# Install all system dependencies and scanners in one layer
RUN apk add --no-cache \
  ca-certificates \
  skopeo \
  curl \
  tar \
  gzip \
  xz \
  gnupg \
  docker-cli \
  && set -eux \
  # Install Trivy
  && curl -sSfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin "${TRIVY_VERSION}" \
  # Install Grype
  && curl -fsSL https://raw.githubusercontent.com/anchore/grype/main/install.sh | sh -s -- -b /usr/local/bin \
  # Install Syft
  && curl -sSfL https://raw.githubusercontent.com/anchore/syft/main/install.sh | sh -s -- -b /usr/local/bin \
  # Install OSV-Scanner
  && curl -L "https://github.com/google/osv-scanner/releases/download/v2.2.1/osv-scanner_linux_amd64" -o /usr/local/bin/osv-scanner \
  && chmod +x /usr/local/bin/osv-scanner \
  # Install Dive
  && curl -L "https://github.com/wagoodman/dive/releases/download/v0.13.1/dive_0.13.1_linux_amd64.tar.gz" -o /tmp/dive.tgz \
  && tar -xzf /tmp/dive.tgz -C /usr/local/bin dive \
  && rm /tmp/dive.tgz \
  && chmod +x /usr/local/bin/dive \
  # Install Dockle
  && curl -L "https://github.com/goodwithtech/dockle/releases/download/${DOCKLE_VERSION}/dockle_0.4.15_Linux-64bit.tar.gz" -o /tmp/dockle.tgz \
  && tar -xzf /tmp/dockle.tgz -C /usr/local/bin dockle \
  && rm /tmp/dockle.tgz \
  && chmod +x /usr/local/bin/dockle \
  # Clean up
  && rm -rf /var/cache/apk/* /tmp/* /var/tmp/*

# Create cache dirs (empty for smaller image - will populate on first run)
ENV TRIVY_CACHE_DIR=/opt/trivy-cache \
  GRYPE_DB_CACHE_DIR=/opt/grype-cache \
  SYFT_CACHE_DIR=/opt/syft-cache
RUN mkdir -p "$TRIVY_CACHE_DIR" "$GRYPE_DB_CACHE_DIR" "$SYFT_CACHE_DIR"

# Create writable workspace for node user
RUN mkdir -p /workspace && chown node:node /workspace

# Copy built Next.js app (using standalone output for minimal size)
ENV NODE_ENV=production

# Copy standalone server and dependencies (much smaller than full .next)
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src/generated ./src/generated

# Copy database initialization scripts
COPY --from=builder /app/scripts ./scripts

# Set default database URL (can be overridden at runtime)
ENV DATABASE_URL="file:./app.db"

# Run as root (scanners need Docker access)
USER root

EXPOSE 3000

# Initialize database and start server
CMD ["sh", "-c", "node scripts/init-database.js && node server.js"]