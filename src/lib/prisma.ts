import { PrismaClient } from '@/generated/prisma'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Enhanced Prisma client with optimized settings
export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.LOG_LEVEL === 'debug' ? ['query', 'info', 'warn', 'error'] : ['warn', 'error']
})

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

// Warm up the connection pool in development
if (process.env.NODE_ENV === 'development') {
  // Connect to database on startup to avoid cold start delays
  prisma.$connect().catch(() => {
    // Ignore connection errors on startup - they'll be handled when actually needed
  })
}