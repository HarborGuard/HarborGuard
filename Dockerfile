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

ARG TARGETARCH
ARG TRIVY_VERSION=v0.65.0
ARG DOCKLE_VERSION=0.4.15
ARG OSV_SCANNER_VERSION=v2.2.2
ARG DIVE_VERSION=0.13.1

# Install Prisma CLI only (minimal size)
RUN npm install -g prisma@6.14.0 --no-save

# Install PostgreSQL 16, Buildah, and other dependencies
RUN apk add --no-cache \
    postgresql16 \
    postgresql16-client \
    postgresql16-contrib \
    ca-certificates skopeo curl tar gzip xz gnupg docker-cli openssl \
    bash tzdata su-exec \
    buildah podman fuse-overlayfs shadow-uidmap slirp4netns \
    crun iptables ip6tables \
  && set -eux \
  # Debug: Show target architecture
  && echo "Building for architecture: ${TARGETARCH:-not set}" \
  # Set default if TARGETARCH is not provided
  && TARGETARCH="${TARGETARCH:-amd64}" \
  # Create a fake uname that returns the correct architecture for the target platform
  && echo '#!/bin/sh' > /usr/local/bin/uname \
  && echo 'if [ "$1" = "-m" ]; then' >> /usr/local/bin/uname \
  && echo '  case "${TARGETARCH}" in' >> /usr/local/bin/uname \
  && echo '    arm64) echo "aarch64" ;;' >> /usr/local/bin/uname \
  && echo '    amd64) echo "x86_64" ;;' >> /usr/local/bin/uname \
  && echo '    *) echo "x86_64" ;;' >> /usr/local/bin/uname \
  && echo '  esac' >> /usr/local/bin/uname \
  && echo 'else' >> /usr/local/bin/uname \
  && echo '  /bin/uname "$@"' >> /usr/local/bin/uname \
  && echo 'fi' >> /usr/local/bin/uname \
  && chmod +x /usr/local/bin/uname \
  # Install Trivy
  && curl -sSfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin "${TRIVY_VERSION}" \
  # Install Grype (will use our fake uname)
  && curl -fsSL https://get.anchore.io/grype | sh -s -- -b /usr/local/bin \
  # Install Syft (will use our fake uname)
  && curl -sSfL https://get.anchore.io/syft | sh -s -- -b /usr/local/bin \
  # Remove the fake uname after installation
  && rm /usr/local/bin/uname \
  # Install OSV Scanner
  && curl -L "https://github.com/google/osv-scanner/releases/download/${OSV_SCANNER_VERSION}/osv-scanner_linux_${TARGETARCH}" -o /usr/local/bin/osv-scanner \
  && chmod +x /usr/local/bin/osv-scanner \
  # Install Dive
  && curl -L "https://github.com/wagoodman/dive/releases/download/v${DIVE_VERSION}/dive_${DIVE_VERSION}_linux_${TARGETARCH}.tar.gz" -o /tmp/dive.tgz \
  && tar -xzf /tmp/dive.tgz -C /usr/local/bin dive \
  && rm /tmp/dive.tgz \
  && chmod +x /usr/local/bin/dive \
  # Install dockle
  && if [ "$TARGETARCH" = "amd64" ]; then \
        DOCKLE_ARCH=64bit; \
     elif [ "$TARGETARCH" = "arm64" ]; then \
        DOCKLE_ARCH=ARM64; \
     else \
        echo "Unsupported architecture: $TARGETARCH" && exit 1; \
     fi \
  && echo "Downloading dockle for ${DOCKLE_ARCH}" \
  && curl -L "https://github.com/goodwithtech/dockle/releases/download/v${DOCKLE_VERSION}/dockle_${DOCKLE_VERSION}_Linux-${DOCKLE_ARCH}.tar.gz" \
       -o /tmp/dockle.tgz \
  && tar -xzf /tmp/dockle.tgz -C /usr/local/bin dockle \
  && rm /tmp/dockle.tgz \
  && chmod +x /usr/local/bin/dockle \
  && rm -rf /var/cache/apk/* /tmp/* /var/tmp/*

ENV TRIVY_CACHE_DIR=/workspace/cache/trivy \
    GRYPE_DB_CACHE_DIR=/workspace/cache/grype \
    SYFT_CACHE_DIR=/workspace/cache/syft \
    BUILDAH_ISOLATION=chroot \
    STORAGE_DRIVER=overlay \
    STORAGE_OPTS="overlay.mount_program=/usr/bin/fuse-overlayfs" \
    BUILDAH_FORMAT=docker

RUN mkdir -p /workspace && chown node:node /workspace
RUN mkdir -p /workspace/cache/trivy/db /workspace/cache/grype /workspace/cache/syft /workspace/cache/dockle && \
    chmod -R 755 /workspace/cache

# Setup Buildah configuration
RUN mkdir -p /etc/containers /workspace/patches /workspace/images && \
    echo 'root:100000:65536' > /etc/subuid && \
    echo 'root:100000:65536' > /etc/subgid && \
    chmod 644 /etc/subuid /etc/subgid && \
    echo '{"default": [{"type": "insecureAcceptAnything"}]}' > /etc/containers/policy.json && \
    echo '[registries.search]' > /etc/containers/registries.conf && \
    echo "registries = ['docker.io', 'quay.io']" >> /etc/containers/registries.conf

# Create Buildah storage configuration
RUN echo '[storage]' > /etc/containers/storage.conf && \
    echo 'driver = "overlay"' >> /etc/containers/storage.conf && \
    echo 'runroot = "/var/run/containers/storage"' >> /etc/containers/storage.conf && \
    echo 'graphroot = "/var/lib/containers/storage"' >> /etc/containers/storage.conf && \
    echo '[storage.options]' >> /etc/containers/storage.conf && \
    echo 'mount_program = "/usr/bin/fuse-overlayfs"' >> /etc/containers/storage.conf && \
    mkdir -p /var/lib/containers /var/run/containers && \
    chmod -R 755 /var/lib/containers /var/run/containers

# Setup PostgreSQL
RUN mkdir -p /var/lib/postgresql/data /run/postgresql && \
    chown -R postgres:postgres /var/lib/postgresql /run/postgresql && \
    chmod 700 /var/lib/postgresql/data

ENV NODE_ENV=production \
    PGDATA=/var/lib/postgresql/data \
    HOSTNAME=0.0.0.0

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
