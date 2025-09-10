# <img src="public/icons.svg" alt="Harbor Guard Logo" width="44" height="44" style="vertical-align: middle; filter: brightness(0) invert(1);"> Harbor Guard

[![Next.js](https://img.shields.io/badge/Next.js-15.4.6-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.1.0-blue?style=flat-square&logo=react)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma-6.14.0-2D3748?style=flat-square&logo=prisma)](https://www.prisma.io/)
[![Docker](https://img.shields.io/badge/Docker-enabled-2496ED?style=flat-square&logo=docker)](https://www.docker.com/)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

A comprehensive container security scanning platform that provides an intuitive web interface for managing and visualizing security assessments of Docker images.

## Installation

### Docker (Recommended)

Run Harbor Guard with minimal features:

```bash
docker run -p 3000:3000 ghcr.io/harborguard/harborguard:latest
```

To give Harbor Guard access to your local images:

```bash
docker run -p 3000:3000 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  ghcr.io/harborguard/harborguard:latest
```

To automatically patch images with Harbor Guard (filesystem permission require privileged access):

```bash
docker run --privileged \
  -p 3000:3000 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  ghcr.io/harborguard/harborguard:latest
```

To use with an external PostgreSQL database:

```bash
docker run -p 3000:3000 \
  -e DATABASE_URL="postgresql://user:pass@host:5432/harborguard" \
  -v /var/run/docker.sock:/var/run/docker.sock \
  ghcr.io/harborguard/harborguard:latest
```

Access the application at `http://localhost:3000`

## Environment Variables

Harbor Guard supports comprehensive configuration through environment variables. All variables have sensible defaults and proper validation.

| Variable | Description | Default | Valid Values | Example |
|----------|-------------|---------|--------------|---------|
| **Scanner Configuration** |
| `MAX_CONCURRENT_SCANS` | Limits concurrent scanner execution to prevent resource exhaustion | `3` | `1-20` | `MAX_CONCURRENT_SCANS=5` |
| `SCAN_TIMEOUT_MINUTES` | Maximum time allowed for individual scanner execution | `30` | `5-180` | `SCAN_TIMEOUT_MINUTES=60` |
| `ENABLED_SCANNERS` | Comma-separated list of enabled scanners | `trivy,grype,syft,dockle,osv,dive` | Any combination of: `trivy`, `grype`, `syft`, `dockle`, `osv`, `dive` | `ENABLED_SCANNERS=trivy,grype` |
| **Logging & Debugging** |
| `LOG_LEVEL` | Controls application log verbosity | `info` | `debug`, `info`, `warn`, `error` | `LOG_LEVEL=debug` |
| **Database & Maintenance** |
| `DATABASE_URL` | PostgreSQL database connection string | Bundled PostgreSQL | External PostgreSQL: `postgresql://user:pass@host:port/db` | `DATABASE_URL="postgresql://user:pass@localhost:5432/harborguard"` |
| `CLEANUP_OLD_SCANS_DAYS` | Automatically delete scans older than specified days | `30` | `1-365` | `CLEANUP_OLD_SCANS_DAYS=90` |
| **Network & Deployment** |
| `PORT` | Server listening port | `3000` | `1000-65535` | `PORT=8080` |
| `HOSTNAME` | Server bind address | `0.0.0.0` | Valid IP address | `HOSTNAME=127.0.0.1` |
| **Notifications** |
| `TEAMS_WEBHOOK_URL` | Microsoft Teams webhook URL for notifications | *none* | Valid HTTPS URL | `TEAMS_WEBHOOK_URL=https://outlook.office.com/webhook/...` |
| `SLACK_WEBHOOK_URL` | Slack webhook URL for notifications | *none* | Valid HTTPS URL | `SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...` |
| `GOTIFY_SERVER_URL` | Gotify server URL for self-hosted notifications | *none* | Valid HTTP/HTTPS URL | `GOTIFY_SERVER_URL=https://gotify.example.com` |
| `GOTIFY_APP_TOKEN` | Gotify application token for authentication | *none* | Valid token string | `GOTIFY_APP_TOKEN=AC5X0f7ISmwz-zJ` |
| `APPRISE_API_URL` | Apprise API URL for multi-service notifications | *none* | Valid HTTP/HTTPS URL | `APPRISE_API_URL=https://apprise.example.com` |
| `APPRISE_CONFIG_KEY` | Apprise configuration key (optional) | *none* | Configuration key string | `APPRISE_CONFIG_KEY=harborguard` |
| `APPRISE_URLS` | Direct Apprise notification URLs (comma-separated) | *none* | Comma-separated service URLs | `APPRISE_URLS=mailto://user:pass@gmail.com,discord://webhook/...` |
| `NOTIFY_ON_HIGH_SEVERITY` | Send notifications only for high/critical findings | `true` | `true`, `false` | `NOTIFY_ON_HIGH_SEVERITY=false` |
| **Monitoring & Health Checks** |
| `HEALTH_CHECK_ENABLED` | Enable `/api/health` and `/api/ready` endpoints | `true` | `true`, `false` | `HEALTH_CHECK_ENABLED=false` |
| `VERSION_CHECK_ENABLED` | Enable automatic version checking for updates | `true` | `true`, `false` | `VERSION_CHECK_ENABLED=false` |

### Advanced Environment Variables

These variables are typically used for internal configuration or advanced deployments:

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `SCANNER_WORKDIR` | Working directory for scanner operations | `/workspace` | `SCANNER_WORKDIR=/tmp/scanners` |
| `PATCH_WORKDIR` | Working directory for patch operations | `/workspace/patches` | `PATCH_WORKDIR=/tmp/patches` |
| `ENABLE_RAW_OUTPUT` | Enable raw scanner output in API responses | `false` | `ENABLE_RAW_OUTPUT=true` |
| `NEXT_PUBLIC_DEMO_MODE` | Enable demo mode with limited functionality | `false` | `NEXT_PUBLIC_DEMO_MODE=true` |
| `NEXT_PUBLIC_APP_URL` | Public application URL (for OpenAPI spec) | `http://localhost:3000` | `NEXT_PUBLIC_APP_URL=https://harborguard.example.com` |
| `NEXT_PUBLIC_API_URL` | Public API URL (for OpenAPI spec) | *auto-detected* | `NEXT_PUBLIC_API_URL=https://api.harborguard.example.com` |
| `NEXT_PUBLIC_APP_VERSION` | Override application version display | *auto-detected* | `NEXT_PUBLIC_APP_VERSION=1.0.0` |
| `NODE_ENV` | Node.js environment mode | `production` | `NODE_ENV=development` |
| `NEXT_RUNTIME` | Next.js runtime environment | *auto-detected* | `NEXT_RUNTIME=nodejs` |
| `PGDATA` | PostgreSQL data directory (bundled PostgreSQL only) | `/var/lib/postgresql/data` | `PGDATA=/data/postgres` |
| `POSTGRES_USER` | PostgreSQL username (bundled PostgreSQL only) | `harborguard` | `POSTGRES_USER=admin` |
| `POSTGRES_PASSWORD` | PostgreSQL password (bundled PostgreSQL only) | `harborguard` | `POSTGRES_PASSWORD=secure_password` |
| `POSTGRES_DB` | PostgreSQL database name (bundled PostgreSQL only) | `harborguard` | `POSTGRES_DB=harborguard_prod` |

### Quick Configuration Examples

**Development Setup:**
```bash
# Minimal development configuration
PORT=3000
LOG_LEVEL=debug
HEALTH_CHECK_ENABLED=true
```

**Production Setup:**
```bash
# Production configuration with PostgreSQL and notifications
DATABASE_URL="postgresql://user:password@db:5432/harborguard"
PORT=8080
LOG_LEVEL=warn
MAX_CONCURRENT_SCANS=10
SCAN_TIMEOUT_MINUTES=60
ENABLED_SCANNERS=trivy,grype,syft

# Choose your notification service(s):
# Option 1: Microsoft Teams
TEAMS_WEBHOOK_URL=https://outlook.office.com/webhook/your-webhook-url

# Option 2: Slack
# SLACK_WEBHOOK_URL=https://hooks.slack.com/services/your-webhook

# Option 3: Self-hosted Gotify
# GOTIFY_SERVER_URL=https://gotify.example.com
# GOTIFY_APP_TOKEN=your-app-token

# Option 4: Apprise (supports 80+ notification services)
# APPRISE_API_URL=https://apprise.example.com
# APPRISE_URLS=discord://webhook/...,mailto://user:pass@gmail.com

NOTIFY_ON_HIGH_SEVERITY=true
CLEANUP_OLD_SCANS_DAYS=60
HEALTH_CHECK_ENABLED=true
VERSION_CHECK_ENABLED=true
```

**Resource-Constrained Environment:**
```bash
# Optimized for low-resource environments
MAX_CONCURRENT_SCANS=1
SCAN_TIMEOUT_MINUTES=15
ENABLED_SCANNERS=trivy,grype
LOG_LEVEL=error
CLEANUP_OLD_SCANS_DAYS=7
```

**Docker Deployment:**
```bash
docker run -p 8080:8080 \
  -e PORT=8080 \
  -e MAX_CONCURRENT_SCANS=5 \
  -e LOG_LEVEL=info \
  -e TEAMS_WEBHOOK_URL=https://your-webhook-url \
  -v /var/run/docker.sock:/var/run/docker.sock \
  ghcr.io/harborguard/harborguard:latest
```

## Screenshots

<div align="center">
  <img src="assets/home.png" alt="Harbor Guard Dashboard" style="border-radius: 12px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);" width="800">
  <p><em>Harbor Guard Dashboard - Container security scanning made simple</em></p>
</div>

### Development Setup

1. Clone the repository:
```bash
git clone https://github.com/HarborGuard/HarborGuard.git
cd HarborGuard
```

2. Install dependencies:
```bash
npm install
```

3. Set up the database:
```bash
npm run db:init
```

> **Database**: Harbor Guard uses PostgreSQL. It includes a bundled PostgreSQL instance, or you can connect to an external database via `DATABASE_URL`. See [Database Configuration Guide](DATABASE.md) for detailed setup instructions.

4. Start the development server:
```bash
npm run dev
```

## Purpose

Harbor Guard is a modern web application designed to streamline container security management by providing a unified interface for multiple scanning tools and advanced visualization capabilities.

### Multi-Tool Security Scanning

<div align="center">
  <img src="assets/scan.png" alt="Harbor Guard Scans" style="border-radius: 12px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);" width="800">
  <p><em>Harbor Guard Dashboard - Container security scanning made simple</em></p>
</div>

Harbor Guard integrates and orchestrates multiple industry-standard security scanning tools:

- **[Trivy](https://github.com/aquasecurity/trivy)** - Comprehensive vulnerability scanner for containers
- **[Grype](https://github.com/anchore/grype)** - Vulnerability scanner by Anchore  
- **[Syft](https://github.com/anchore/syft)** - Software Bill of Materials (SBOM) generator
- **[Dockle](https://github.com/goodwithtech/dockle)** - Container image linter for security and best practices
- **[OSV Scanner](https://github.com/google/osv-scanner)** - Open Source Vulnerability database scanner
- **[Dive](https://github.com/wagoodman/dive)** - Docker image layer analysis and optimization tool

### Optimized Visualization Strategy

<div align="center">
  <img src="assets/libraries.png" alt="Harbor Guard Library" style="border-radius: 12px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);" width="800">
  <p><em>Harbor Guard Dashboard - Container security scanning made simple</em></p>
</div>

The platform employs several innovative approaches to vulnerability data visualization:

#### Library Vulnerability Scatterplot
- **Multi-dimensional mapping** - X-axis represents severity levels, Y-axis shows vulnerability counts
- **Interactive filtering** - Toggle visibility by severity level with real-time count updates
- **Clickable exploration** - Navigate directly to library-specific analysis from chart points
- **Color-coded severity** - Consistent color scheme across all interfaces (red/orange/yellow/blue)

#### Layer-by-Layer Analysis
- **Horizontal tab navigation** - Each Docker layer gets its own tab for focused analysis
- **Dynamic sizing** - Tab layout adapts to any number of layers without breaking
- **File system exploration** - Detailed view of files added/modified in each layer
- **Size optimization insights** - Visual indicators for layer sizes and optimization opportunities

#### Findings Management
- **Severity-based grouping** - Organize findings by Critical, High, Medium, Low severity
- **Progress tracking** - Visual indicators for scan completion and remediation status
- **Export flexibility** - Individual JSON reports or complete ZIP archives
- **API accessibility** - Public REST endpoints for programmatic access to scan data

## Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details.

## License

This project is licensed under the AGPL-3.0 License - see the [LICENSE](LICENSE) file for details.

## Support

- 🐛 [Report Issues](https://github.com/HarborGuard/HarborGuard/issues)
- 💬 [Discussions](https://github.com/HarborGuard/HarborGuard/discussions)
- 📧 [Email Support](mailto:hello@harborguard.co)

## Acknowledgments

Special thanks to the maintainers of the integrated security tools:
- Aqua Security (Trivy)
- Anchore (Grype, Syft)
- goodwithtech (Dockle)
- Google (OSV Scanner)
- wagoodman (Dive)
- containers (Skopeo, Buildah)

---

<div align="center">
  <strong>Harbor Guard</strong> - Securing containers, one scan at a time.
</div>
