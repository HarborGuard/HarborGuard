# API Performance Optimization Plan

## Current Performance Issues
- **API Response Time**: 495ms average
- **Response Size**: 8.15 MB
- **JSONB Overhead**: 5.95 MB (73% of response)
- **Record Count**: ~1,942 nested records loaded

## Root Causes
1. Loading both JSONB and table data (duplicate data)
2. No pagination for large collections (1,774 Syft packages)
3. Excessive database joins (18+ operations)
4. No caching strategy

## Recommended Optimizations

### 1. HIGH PRIORITY: Exclude JSONB Fields (60% size reduction)
```typescript
// In /api/scans/[id]/route.ts
const scan = await prisma.scan.findUnique({
  where: { id },
  include: {
    image: true,
    metadata: {
      select: {
        id: true,
        // Exclude JSONB fields
        trivyResults: false,
        grypeResults: false,
        syftResults: false,
        dockleResults: false,
        osvResults: false,
        diveResults: false,
        // Include table relations
        grypeResult: { include: { vulnerabilities: true } },
        trivyResult: { include: { vulnerabilities: true } },
        // ... other relations
      }
    }
  }
});
```

### 2. HIGH PRIORITY: Paginate Syft Packages
```typescript
// Limit packages to first 100, add endpoint for pagination
syftResult: {
  include: {
    packages: {
      take: 100,
      orderBy: { name: 'asc' }
    }
  }
}

// Add new endpoint: /api/scans/[id]/packages?page=2&limit=100
```

### 3. MEDIUM PRIORITY: Split Queries
```typescript
// Option A: Lazy load scanner results
// First query: Basic scan info
const scan = await prisma.scan.findUnique({
  where: { id },
  include: { image: true, metadata: { select: basicFields } }
});

// Parallel queries for scanner results (on demand)
const [grype, trivy] = await Promise.all([
  prisma.grypeResults.findUnique({ where: { scanMetadataId } }),
  prisma.trivyResults.findUnique({ where: { scanMetadataId } })
]);
```

### 4. MEDIUM PRIORITY: Add Composite Indexes
```prisma
// In schema.prisma - Add indexes for common query patterns
model GrypeVulnerability {
  // ... existing fields
  @@index([grypeResultsId, severity]) // Fast severity filtering
}

model TrivyVulnerability {
  // ... existing fields
  @@index([trivyResultsId, severity]) // Fast severity filtering
}
```

### 5. LOW PRIORITY: Database Connection Pooling
```typescript
// In lib/prisma.ts
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  // Optimize connection pool
  connection_limit: 10,
  pool_timeout: 10,
});
```

## Expected Results After Optimization
- **Response Time**: <100ms (80% improvement)
- **Response Size**: 2.4 MB (70% reduction)
- **Database Load**: Reduced by 60%
- **User Experience**: Instant page loads

## Implementation Steps
1. **Quick Win**: Remove JSONB from default queries (1 hour)
2. **Packages API**: Add pagination for Syft packages (2 hours)
3. **Indexes**: Add composite indexes via migration (30 minutes)
4. **Testing**: Verify performance improvements (1 hour)
5. **Future**: Consider Redis caching for frequently accessed scans