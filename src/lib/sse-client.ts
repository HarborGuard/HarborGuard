"use client"

import { ScanProgressEvent } from '@/lib/scanner/types';

export type { ScanProgressEvent };

export interface SSEEvent {
  type: 'connected' | 'progress' | 'heartbeat';
  requestId?: string;
  timestamp: string;
  [key: string]: any;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export class SSEClient {
  private eventSource: EventSource | null = null;
  private url: string;
  private listeners: {
    status: Set<(status: ConnectionStatus) => void>;
    progress: Set<(data: ScanProgressEvent) => void>;
    error: Set<(error: string) => void>;
  } = {
    status: new Set(),
    progress: new Set(),
    error: new Set()
  };
  private status: ConnectionStatus = 'disconnected';
  private requestId: string;

  constructor(requestId: string) {
    this.requestId = requestId;
    this.url = `/api/scans/events/${requestId}`;
  }

  private setStatus(status: ConnectionStatus) {
    if (this.status !== status) {
      this.status = status;
      console.log(`SSE status changed to: ${status} for scan: ${this.requestId}`);
      this.listeners.status.forEach(listener => listener(status));
    }
  }

  private emitProgress(data: ScanProgressEvent) {
    this.listeners.progress.forEach(listener => listener(data));
  }

  private emitError(error: string) {
    this.listeners.error.forEach(listener => listener(error));
  }

  connect(): boolean {
    if (this.eventSource && this.eventSource.readyState !== EventSource.CLOSED) {
      return true;
    }

    try {
      console.log(`SSE connecting to: ${this.url}`);
      this.setStatus('connecting');
      
      this.eventSource = new EventSource(this.url);

      this.eventSource.onopen = () => {
        console.log(`SSE connected for scan: ${this.requestId}`);
        this.setStatus('connected');
      };

      this.eventSource.onmessage = (event) => {
        try {
          const data: SSEEvent = JSON.parse(event.data);
          
          switch (data.type) {
            case 'connected':
              console.log(`SSE connection confirmed for scan: ${this.requestId}`);
              break;
            
            case 'progress':
              // Ensure the data has all required ScanProgressEvent properties
              if (data.scanId && data.status && typeof data.progress === 'number') {
                this.emitProgress(data as unknown as ScanProgressEvent);
              } else {
                console.error('Invalid progress event data:', data);
              }
              break;
            
            case 'heartbeat':
              // Heartbeat received, connection is alive
              break;
            
            default:
              console.log('Unknown SSE event type:', data.type);
          }
        } catch (error) {
          console.error('Error parsing SSE message:', error);
          this.emitError('Failed to parse server message');
        }
      };

      this.eventSource.onerror = (error) => {
        console.error(`SSE error for scan ${this.requestId}:`, error);
        this.setStatus('error');
        this.emitError('Connection error');
      };

      return true;
    } catch (error) {
      console.error(`Failed to create SSE connection for scan ${this.requestId}:`, error);
      this.setStatus('error');
      this.emitError('Failed to create connection');
      return false;
    }
  }

  disconnect() {
    if (this.eventSource) {
      console.log(`SSE disconnecting for scan: ${this.requestId}`);
      this.eventSource.close();
      this.eventSource = null;
    }
    this.setStatus('disconnected');
  }

  // Event listeners
  onStatusChange(listener: (status: ConnectionStatus) => void) {
    this.listeners.status.add(listener);
    return () => this.listeners.status.delete(listener);
  }

  onProgress(listener: (data: ScanProgressEvent) => void) {
    this.listeners.progress.add(listener);
    return () => this.listeners.progress.delete(listener);
  }

  onError(listener: (error: string) => void) {
    this.listeners.error.add(listener);
    return () => this.listeners.error.delete(listener);
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  isConnected(): boolean {
    return this.status === 'connected';
  }
}