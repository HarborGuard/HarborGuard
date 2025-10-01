import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const scheduledScanId = searchParams.get('scheduledScanId')
    const status = searchParams.get('status')
    const triggerSource = searchParams.get('triggerSource')
    const limit = Math.min(parseInt(searchParams.get('limit') || '25'), 100)
    const offset = parseInt(searchParams.get('offset') || '0')

    const where: any = {}

    if (scheduledScanId) {
      where.scheduledScanId = scheduledScanId
    }

    if (status) {
      where.status = status
    }

    if (triggerSource) {
      where.triggerSource = triggerSource
    }

    const [history, total] = await Promise.all([
      prisma.scheduledScanHistory.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: { startedAt: 'desc' },
        include: {
          scheduledScan: {
            select: {
              id: true,
              name: true,
              description: true,
              imageSelectionMode: true
            }
          },
          scanResults: {
            select: {
              id: true,
              status: true,
              vulnerabilityCritical: true,
              vulnerabilityHigh: true,
              vulnerabilityMedium: true,
              vulnerabilityLow: true
            }
          },
          _count: {
            select: {
              scanResults: true
            }
          }
        }
      }),
      prisma.scheduledScanHistory.count({ where })
    ])

    // Calculate aggregate vulnerability counts for each history entry
    const historyWithStats = history.map(h => {
      const stats = h.scanResults.reduce((acc, result) => ({
        totalCritical: acc.totalCritical + (result.vulnerabilityCritical || 0),
        totalHigh: acc.totalHigh + (result.vulnerabilityHigh || 0),
        totalMedium: acc.totalMedium + (result.vulnerabilityMedium || 0),
        totalLow: acc.totalLow + (result.vulnerabilityLow || 0),
        successCount: acc.successCount + (result.status === 'SUCCESS' ? 1 : 0),
        failedCount: acc.failedCount + (result.status === 'FAILED' ? 1 : 0),
        pendingCount: acc.pendingCount + (result.status === 'PENDING' || result.status === 'RUNNING' ? 1 : 0)
      }), {
        totalCritical: 0,
        totalHigh: 0,
        totalMedium: 0,
        totalLow: 0,
        successCount: 0,
        failedCount: 0,
        pendingCount: 0
      })

      const { scanResults, ...historyData } = h
      return {
        ...historyData,
        vulnerabilityStats: {
          critical: stats.totalCritical,
          high: stats.totalHigh,
          medium: stats.totalMedium,
          low: stats.totalLow
        },
        scanStats: {
          success: stats.successCount,
          failed: stats.failedCount,
          pending: stats.pendingCount
        }
      }
    })

    return NextResponse.json({
      history: historyWithStats,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total
      }
    })
  } catch (error) {
    console.error('Error fetching scheduled scan history:', error)
    return NextResponse.json(
      { error: 'Failed to fetch scheduled scan history' },
      { status: 500 }
    )
  }
}