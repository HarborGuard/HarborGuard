# Database Configuration Guide

Harbor Guard supports both **SQLite** (default) and **PostgreSQL** databases with automatic fallback functionality.

## Quick Start

### SQLite (Default - No Setup Required)
```bash
# Use default SQLite - no configuration needed
npm start
```

### PostgreSQL (External Database)
```bash
# Set your PostgreSQL connection string
export DATABASE_URL="postgresql://user:password@localhost:5432/harborguard"
npm start
```

## How It Works

Harbor Guard automatically detects your database configuration:

1. **No DATABASE_URL** → Uses SQLite (`file:./dev.db`)
2. **PostgreSQL URL** → Attempts PostgreSQL connection
   - ✅ **Success** → Uses PostgreSQL
   - ❌ **Failure** → Falls back to SQLite with warning
3. **SQLite URL** → Uses SQLite directly

## Configuration Examples

### Environment Variables

#### SQLite (Default)
```bash
# .env.local
DATABASE_URL="file:./dev.db"
```

#### Local PostgreSQL
```bash
# .env.local  
DATABASE_URL="postgresql://postgres:password@localhost:5432/harborguard"
```

#### Docker PostgreSQL
```bash
# .env.local
DATABASE_URL="postgresql://postgres:password@db:5432/harborguard"
```

#### Cloud PostgreSQL
```bash
# .env.local
DATABASE_URL="postgresql://user:pass@your-host.com:5432/database"
```

## Docker Deployment

### With SQLite (Default)
```dockerfile
# Dockerfile or docker-compose.yml
ENV DATABASE_URL="file:./app.db"
```

### With External PostgreSQL
```dockerfile
# Dockerfile or docker-compose.yml
ENV DATABASE_URL="postgresql://user:pass@db-host:5432/harborguard"
```

### Docker Compose Example
```yaml
# docker-compose.yml
version: '3.8'
services:
  harborguard:
    image: harborguard:latest
    environment:
      - DATABASE_URL=postgresql://postgres:password@db:5432/harborguard
    depends_on:
      - db

  db:
    image: postgres:15
    environment:
      - POSTGRES_DB=harborguard
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

## Database Commands

### Initialization
```bash
# Initialize database (auto-detects provider)
npm run db:init

# OR use the specific commands:
npm run db:migrate    # For existing migrations
npm run db:push       # For schema sync
npm run db:generate   # Generate Prisma client
```

### Reset Database
```bash
# Reset database (WARNING: destroys all data)
npm run db:reset
```

## Migration Behavior

### SQLite
- Uses existing migration files
- Runs `prisma migrate deploy`
- Creates `dev.db` file locally

### PostgreSQL
- Uses `prisma db push` for initial setup
- Syncs schema directly to avoid SQLite/PostgreSQL compatibility issues
- Works with any PostgreSQL-compatible database

## Troubleshooting

### PostgreSQL Connection Issues

If PostgreSQL connection fails, Harbor Guard automatically falls back to SQLite:

```
[DB] PostgreSQL connection failed: Can't reach database server
[DB] External database connection failed, falling back to SQLite
[DB] Warning: External database unavailable, using local SQLite
```

**Common Issues:**
- Database server not running
- Wrong connection credentials
- Network connectivity issues
- Database doesn't exist

**Solutions:**
1. Verify PostgreSQL server is running
2. Check connection string format
3. Ensure database exists
4. Test connection manually: `psql "postgresql://user:pass@host:5432/db"`

### Schema Issues

If you encounter schema-related errors:

```bash
# Reset and reinitialize
npm run db:reset
npm run db:init
```

### Permission Issues

For Docker deployments, ensure proper file permissions:

```bash
# In Dockerfile
RUN mkdir -p /app && chown node:node /app
USER node
```

## Production Recommendations

### For SQLite
- ✅ Simple single-node deployments
- ✅ Development and testing
- ✅ Small to medium workloads
- ❌ Multi-container deployments
- ❌ High concurrency requirements

### For PostgreSQL
- ✅ Production deployments
- ✅ Multi-container setups
- ✅ High availability requirements
- ✅ Better backup and recovery
- ✅ Advanced querying and analytics

## Data Migration

### SQLite to PostgreSQL
When switching from SQLite to PostgreSQL, you'll need to migrate your data:

1. Export data from SQLite:
```bash
# Export scans and images
npm run export-data
```

2. Set up PostgreSQL and update DATABASE_URL

3. Initialize PostgreSQL schema:
```bash
npm run db:init
```

4. Import data to PostgreSQL:
```bash
npm run import-data
```

Note: Data migration tools are not yet implemented but can be added as needed.

## Security Considerations

### Connection Strings
- Never commit database credentials to version control
- Use environment variables for sensitive data
- Consider using connection string secrets management

### Network Security
- Use SSL/TLS for PostgreSQL connections
- Restrict database network access
- Use strong passwords and proper authentication

### Backup Strategy
- **SQLite**: Backup the `.db` file
- **PostgreSQL**: Use `pg_dump` for backups

```bash
# SQLite backup
cp dev.db backup-$(date +%Y%m%d).db

# PostgreSQL backup
pg_dump "postgresql://user:pass@host/db" > backup-$(date +%Y%m%d).sql
```