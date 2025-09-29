"use client"

import { EventEmitter } from 'events';
import { ScanProgressEvent } from '@/lib/scanner/types';

interface SSEConnectionOptions {
  maxRetries?: number;
  retryInterval?: number;
  heartbeatTimeout?: number;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error' | 'reconnecting';

interface ManagedConnection {
  requestId: string;
  eventSource: EventSource | null;
  status: ConnectionStatus;
  retryCount: number;
  heartbeatTimer?: NodeJS.Timeout;
  reconnectTimer?: NodeJS.Timeout;
  lastActivity: number;
}

/**
 * Singleton SSEManager to handle all SSE connections globally
 * Provides connection pooling, auto-reconnection, and proper cleanup
 */
class SSEManager extends EventEmitter {
  private static instance: SSEManager;
  private connections: Map<string, ManagedConnection> = new Map();
  private options: Required<SSEConnectionOptions> = {
    maxRetries: 3,
    retryInterval: 1000,
    heartbeatTimeout: 30000,
  };
  private cleanupInterval?: NodeJS.Timeout;
  private debug = process.env.NODE_ENV === 'development';

  private constructor() {
    super();
    this.startCleanupTimer();
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => this.disconnectAll());
    }
  }

  static getInstance(): SSEManager {
    if (!SSEManager.instance) {
      SSEManager.instance = new SSEManager();
    }
    return SSEManager.instance;
  }

  private log(message: string, ...args: any[]) {
    if (this.debug) {
      console.log(`[SSEManager] ${message}`, ...args);
    }
  }

  private error(message: string, ...args: any[]) {
    console.error(`[SSEManager] ${message}`, ...args);
  }

  /**
   * Connect to an SSE endpoint for a specific scan request
   */
  connect(requestId: string, options?: SSEConnectionOptions): boolean {
    // Check if already connected
    const existing = this.connections.get(requestId);
    if (existing && existing.status === 'connected') {
      this.log(`Already connected to ${requestId}`);
      return true;
    }

    // Merge options
    const connOptions = { ...this.options, ...options };

    // Create managed connection
    const connection: ManagedConnection = {
      requestId,
      eventSource: null,
      status: 'connecting',
      retryCount: 0,
      lastActivity: Date.now(),
    };

    this.connections.set(requestId, connection);
    this.establishConnection(requestId, connOptions);
    return true;
  }

  private establishConnection(requestId: string, options: Required<SSEConnectionOptions>) {
    const connection = this.connections.get(requestId);
    if (!connection) return;

    try {
      const url = `/api/scans/events/${requestId}`;
      const eventSource = new EventSource(url);

      connection.eventSource = eventSource;
      connection.status = 'connecting';
      this.emitStatusChange(requestId, 'connecting');

      // Connection opened
      eventSource.onopen = () => {
        this.log(`Connected to ${requestId}`);
        connection.status = 'connected';
        connection.retryCount = 0;
        connection.lastActivity = Date.now();
        this.emitStatusChange(requestId, 'connected');
        this.startHeartbeatTimer(requestId, options.heartbeatTimeout);
      };

      // Message received
      eventSource.onmessage = (event) => {
        try {
          connection.lastActivity = Date.now();
          const data = JSON.parse(event.data);

          switch (data.type) {
            case 'progress':
              if (this.isValidProgressEvent(data)) {
                this.emit('progress', requestId, data as ScanProgressEvent);
              }
              break;
            case 'heartbeat':
              this.resetHeartbeatTimer(requestId, options.heartbeatTimeout);
              break;
            case 'connected':
              this.log(`Connection confirmed for ${requestId}`);
              break;
            default:
              this.log(`Unknown event type for ${requestId}:`, data.type);
          }
        } catch (err) {
          this.error(`Error parsing message for ${requestId}:`, err);
        }
      };

      // Error occurred
      eventSource.onerror = (error) => {
        this.error(`Connection error for ${requestId}:`, error);
        this.handleConnectionError(requestId, options);
      };

    } catch (err) {
      this.error(`Failed to establish connection for ${requestId}:`, err);
      this.handleConnectionError(requestId, options);
    }
  }

  private handleConnectionError(requestId: string, options: Required<SSEConnectionOptions>) {
    const connection = this.connections.get(requestId);
    if (!connection) return;

    // Clean up existing connection
    if (connection.eventSource) {
      connection.eventSource.close();
      connection.eventSource = null;
    }

    // Clear timers
    this.clearHeartbeatTimer(requestId);
    this.clearReconnectTimer(requestId);

    // Check if we should retry
    if (connection.retryCount < options.maxRetries) {
      connection.retryCount++;
      connection.status = 'reconnecting';
      this.emitStatusChange(requestId, 'reconnecting');

      const delay = Math.min(
        options.retryInterval * Math.pow(2, connection.retryCount - 1),
        30000
      );

      this.log(`Reconnecting ${requestId} in ${delay}ms (attempt ${connection.retryCount}/${options.maxRetries})`);

      connection.reconnectTimer = setTimeout(() => {
        this.establishConnection(requestId, options);
      }, delay);
    } else {
      this.log(`Max retries reached for ${requestId}`);
      connection.status = 'error';
      this.emitStatusChange(requestId, 'error');
      this.emit('error', requestId, 'Max reconnection attempts reached');
    }
  }

  private isValidProgressEvent(data: any): boolean {
    return (
      data.requestId &&
      data.scanId &&
      data.status &&
      typeof data.progress === 'number'
    );
  }

  private startHeartbeatTimer(requestId: string, timeout: number) {
    const connection = this.connections.get(requestId);
    if (!connection) return;

    this.clearHeartbeatTimer(requestId);

    connection.heartbeatTimer = setTimeout(() => {
      this.log(`Heartbeat timeout for ${requestId}`);
      this.handleConnectionError(requestId, this.options);
    }, timeout);
  }

  private resetHeartbeatTimer(requestId: string, timeout: number) {
    this.clearHeartbeatTimer(requestId);
    this.startHeartbeatTimer(requestId, timeout);
  }

  private clearHeartbeatTimer(requestId: string) {
    const connection = this.connections.get(requestId);
    if (connection?.heartbeatTimer) {
      clearTimeout(connection.heartbeatTimer);
      connection.heartbeatTimer = undefined;
    }
  }

  private clearReconnectTimer(requestId: string) {
    const connection = this.connections.get(requestId);
    if (connection?.reconnectTimer) {
      clearTimeout(connection.reconnectTimer);
      connection.reconnectTimer = undefined;
    }
  }

  private emitStatusChange(requestId: string, status: ConnectionStatus) {
    this.emit('statusChange', requestId, status);
  }

  /**
   * Disconnect from a specific SSE endpoint
   */
  disconnect(requestId: string) {
    const connection = this.connections.get(requestId);
    if (!connection) return;

    this.log(`Disconnecting from ${requestId}`);

    // Clean up connection
    if (connection.eventSource) {
      connection.eventSource.close();
      connection.eventSource = null;
    }

    // Clear timers
    this.clearHeartbeatTimer(requestId);
    this.clearReconnectTimer(requestId);

    // Remove from connections
    this.connections.delete(requestId);
    this.emitStatusChange(requestId, 'disconnected');
  }

  /**
   * Disconnect all SSE connections
   */
  disconnectAll() {
    this.log('Disconnecting all connections');
    for (const requestId of this.connections.keys()) {
      this.disconnect(requestId);
    }
  }

  /**
   * Get connection status for a specific request
   */
  getConnectionStatus(requestId: string): ConnectionStatus | null {
    const connection = this.connections.get(requestId);
    return connection ? connection.status : null;
  }

  /**
   * Get all active connections
   */
  getActiveConnections(): string[] {
    return Array.from(this.connections.keys()).filter(
      requestId => {
        const conn = this.connections.get(requestId);
        return conn && conn.status === 'connected';
      }
    );
  }

  /**
   * Clean up stale connections periodically
   */
  private startCleanupTimer() {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      const staleTimeout = 5 * 60 * 1000; // 5 minutes

      for (const [requestId, connection] of this.connections.entries()) {
        if (
          connection.status === 'error' ||
          (connection.status === 'disconnected' && now - connection.lastActivity > staleTimeout)
        ) {
          this.log(`Cleaning up stale connection ${requestId}`);
          this.disconnect(requestId);
        }
      }
    }, 60000); // Run every minute
  }

  /**
   * Stop cleanup timer
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
    this.disconnectAll();
    this.removeAllListeners();
  }
}

export default SSEManager;