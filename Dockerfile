# ---- 1) Build Next.js ----
FROM node:20-alpine AS builder
WORKDIR /app

RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./
RUN npm ci --ignore-scripts

COPY . .
RUN mv .env.example .env

# Build will now generate Prisma client automatically
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

# Install PostgreSQL 16 and other dependencies
RUN apk add --no-cache \
    postgresql16 \
    postgresql16-client \
    postgresql16-contrib \
    ca-certificates skopeo curl tar gzip xz gnupg docker-cli openssl \
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

ENV TRIVY_CACHE_DIR=/workspace/cache/trivy \
    GRYPE_DB_CACHE_DIR=/workspace/cache/grype \
    SYFT_CACHE_DIR=/workspace/cache/syft

RUN mkdir -p /workspace && chown node:node /workspace
RUN mkdir -p /workspace/cache/trivy/db /workspace/cache/grype /workspace/cache/syft /workspace/cache/dockle && \
    chmod -R 755 /workspace/cache

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

# Copy and make startup script executable
COPY scripts/start.sh /start.sh
RUN chmod +x /start.sh

USER root
EXPOSE 3000 5432

# Health check using the /api/health endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:${PORT:-3000}/api/health || exit 1

CMD ["/start.sh"]
