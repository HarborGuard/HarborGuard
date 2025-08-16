import * as cron from 'node-cron';
import { prisma } from '@/lib/prisma';
import { scannerService } from '@/lib/scanner';
import type { ScanSchedule, CreateScheduleRequest, BulkScanRequest } from './types';
import type { ScanRequest } from '@/types';

export class SchedulerService {
  private scheduledTasks = new Map<string, cron.ScheduledTask>();

  async createSchedule(request: CreateScheduleRequest): Promise<ScanSchedule> {
    if (!cron.validate(request.cronExpression)) {
      throw new Error('Invalid cron expression');
    }

    const schedule = await prisma.scanSchedule.create({
      data: {
        name: request.name,
        cronExpression: request.cronExpression,
        scanRequest: request.scanRequest as any,
        nextRunAt: this.calculateNextRun(request.cronExpression),
        createdBy: request.createdBy,
      }
    });

    this.startSchedule(schedule.id, schedule.cronExpression, schedule.scanRequest as any);

    return schedule as unknown as ScanSchedule;
  }

  async updateSchedule(id: string, updates: Partial<CreateScheduleRequest>): Promise<ScanSchedule> {
    const existingSchedule = await prisma.scanSchedule.findUnique({
      where: { id }
    });

    if (!existingSchedule) {
      throw new Error(`Schedule ${id} not found`);
    }

    if (updates.cronExpression && !cron.validate(updates.cronExpression)) {
      throw new Error('Invalid cron expression');
    }

    this.stopSchedule(id);

    const updatedData: any = {
      ...updates,
    };

    if (updates.cronExpression) {
      updatedData.nextRunAt = this.calculateNextRun(updates.cronExpression);
    }

    const updated = await prisma.scanSchedule.update({
      where: { id },
      data: updatedData
    });

    if (updated.isActive) {
      this.startSchedule(updated.id, updated.cronExpression, updated.scanRequest as any);
    }

    return updated as unknown as ScanSchedule;
  }

  async deleteSchedule(id: string): Promise<void> {
    this.stopSchedule(id);
    
    await prisma.scanSchedule.delete({
      where: { id }
    });
  }

  async toggleSchedule(id: string, isActive: boolean): Promise<ScanSchedule> {
    const schedule = await prisma.scanSchedule.update({
      where: { id },
      data: { isActive }
    });

    if (isActive) {
      this.startSchedule(schedule.id, schedule.cronExpression, schedule.scanRequest as any);
    } else {
      this.stopSchedule(id);
    }

    return schedule as unknown as ScanSchedule;
  }

  async getSchedules(): Promise<ScanSchedule[]> {
    const schedules = await prisma.scanSchedule.findMany({
      orderBy: [
        { isActive: 'desc' },
        { name: 'asc' }
      ]
    });

    return schedules as unknown as ScanSchedule[];
  }

  async getSchedule(id: string): Promise<ScanSchedule | null> {
    const schedule = await prisma.scanSchedule.findUnique({
      where: { id },
      include: {
        executions: {
          orderBy: { executionTime: 'desc' },
          take: 10
        }
      }
    });

    return schedule as unknown as ScanSchedule | null;
  }

  async initializeSchedules(): Promise<void> {
    console.log('Initializing scheduled scans...');
    
    const activeSchedules = await prisma.scanSchedule.findMany({
      where: { isActive: true }
    });

    for (const schedule of activeSchedules) {
      this.startSchedule(
        schedule.id,
        schedule.cronExpression,
        schedule.scanRequest as any
      );
    }

    console.log(`Initialized ${activeSchedules.length} scheduled scans`);
  }

  private startSchedule(
    scheduleId: string,
    cronExpression: string,
    scanRequest: ScanRequest | BulkScanRequest
  ): void {
    if (this.scheduledTasks.has(scheduleId)) {
      this.stopSchedule(scheduleId);
    }

    const task = cron.schedule(cronExpression, async () => {
      await this.executeScheduledScan(scheduleId, scanRequest);
    }, {
      timezone: 'UTC'
    });

    this.scheduledTasks.set(scheduleId, task);
    console.log(`Started scheduled scan: ${scheduleId} with cron: ${cronExpression}`);
  }

  private stopSchedule(scheduleId: string): void {
    const task = this.scheduledTasks.get(scheduleId);
    if (task) {
      task.stop();
      task.destroy();
      this.scheduledTasks.delete(scheduleId);
      console.log(`Stopped scheduled scan: ${scheduleId}`);
    }
  }

  private async executeScheduledScan(
    scheduleId: string,
    scanRequest: ScanRequest | BulkScanRequest
  ): Promise<void> {
    console.log(`Executing scheduled scan: ${scheduleId}`);

    try {
      let scanId: string | undefined;

      if ('type' in scanRequest && scanRequest.type === 'bulk') {
        // Handle bulk scan request
        const { BulkScanService } = await import('../bulk/BulkScanService');
        const bulkService = new BulkScanService();
        const result = await bulkService.executeBulkScan(scanRequest);
        scanId = result.batchId; // Use batch ID as scan reference
      } else {
        // Handle regular scan request
        const result = await scannerService.startScan(scanRequest as ScanRequest);
        scanId = result.scanId;
      }

      // Log successful execution
      await prisma.scheduledScanExecution.create({
        data: {
          scheduleId,
          scanId,
          status: 'SUCCESS'
        }
      });

      // Update schedule last run time
      await prisma.scanSchedule.update({
        where: { id: scheduleId },
        data: {
          lastRunAt: new Date(),
          nextRunAt: this.calculateNextRun(
            (await prisma.scanSchedule.findUnique({ where: { id: scheduleId } }))?.cronExpression || ''
          )
        }
      });

      console.log(`Scheduled scan ${scheduleId} completed successfully`);

    } catch (error) {
      console.error(`Scheduled scan failed: ${scheduleId}`, error);

      // Log failed execution
      await prisma.scheduledScanExecution.create({
        data: {
          scheduleId,
          status: 'FAILED',
          errorMessage: error instanceof Error ? error.message : String(error)
        }
      });
    }
  }

  private calculateNextRun(cronExpression: string): Date {
    try {
      // Simple fallback calculation - just add 1 hour for now
      // In production, you'd use a proper cron parser like 'cron-parser'
      return new Date(Date.now() + 60 * 60 * 1000);
    } catch (error) {
      console.error('Error calculating next run:', error);
      return new Date(Date.now() + 24 * 60 * 60 * 1000); // Default to 24 hours from now
    }
  }

  async getExecutionHistory(scheduleId: string, limit = 20) {
    return prisma.scheduledScanExecution.findMany({
      where: { scheduleId },
      orderBy: { executionTime: 'desc' },
      take: limit,
      include: {
        scan: {
          select: {
            id: true,
            status: true,
            startedAt: true,
            finishedAt: true,
            image: {
              select: {
                name: true,
                tag: true,
                registry: true
              }
            }
          }
        }
      }
    });
  }

  async getUpcomingSchedules(limit = 10) {
    return prisma.scanSchedule.findMany({
      where: {
        isActive: true,
        nextRunAt: {
          gte: new Date()
        }
      },
      orderBy: { nextRunAt: 'asc' },
      take: limit
    });
  }

  public destroy(): void {
    console.log('Stopping all scheduled scans...');
    
    for (const [scheduleId, task] of this.scheduledTasks) {
      task.stop();
      task.destroy();
      console.log(`Stopped scheduled scan: ${scheduleId}`);
    }
    
    this.scheduledTasks.clear();
  }
}

export const schedulerService = new SchedulerService();