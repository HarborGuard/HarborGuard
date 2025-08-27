/**
 * Centralized logging utility that respects LOG_LEVEL environment variable
 */

import { config } from './config';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class Logger {
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[config.logLevel];
  }

  private formatMessage(level: LogLevel, message: string, ...args: any[]): string {
    const timestamp = new Date().toISOString();
    const levelStr = level.toUpperCase().padEnd(5);
    return `[${timestamp}] ${levelStr} ${message}`;
  }

  debug(message: string, ...args: any[]): void {
    if (this.shouldLog('debug')) {
      console.log(this.formatMessage('debug', message), ...args);
    }
  }

  info(message: string, ...args: any[]): void {
    if (this.shouldLog('info')) {
      console.log(this.formatMessage('info', message), ...args);
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message), ...args);
    }
  }

  error(message: string, ...args: any[]): void {
    if (this.shouldLog('error')) {
      console.error(this.formatMessage('error', message), ...args);
    }
  }

  // Convenience methods for specific contexts
  scanner(message: string, ...args: any[]): void {
    this.info(`[SCANNER] ${message}`, ...args);
  }

  database(message: string, ...args: any[]): void {
    this.info(`[DB] ${message}`, ...args);
  }

  webhook(message: string, ...args: any[]): void {
    this.info(`[WEBHOOK] ${message}`, ...args);
  }

  health(message: string, ...args: any[]): void {
    this.debug(`[HEALTH] ${message}`, ...args);
  }
}

export const logger = new Logger();