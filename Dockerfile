# ---- 1) Build Next.js ----
FROM node:20-alpine AS builder
WORKDIR /app

RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./
RUN npm ci --ignore-scripts

COPY . .
RUN npx prisma generate
RUN npm run build

# ---- 2) Runtime + scanners ----
FROM node:20-alpine AS runtime
WORKDIR /app

ARG TARGETARCH=amd64
ARG TRIVY_VERSION=v0.65.0
ARG DOCKLE_VERSION=0.4.15
ARG OSV_SCANNER_VERSION=v2.2.2
ARG DIVE_VERSION=0.13.1

RUN apk add --no-cache \
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
ENV NODE_ENV=production

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src/generated ./src/generated
COPY --from=builder /app/scripts ./scripts

ENV DATABASE_URL="file:./app.db"
USER root
EXPOSE 3000

CMD ["sh", "-c", "node scripts/init-database.js && node server.js"]
