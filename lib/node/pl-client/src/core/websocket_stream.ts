import { WebSocket } from 'undici';
import type {
  TxAPI_ClientMessage,
  TxAPI_ServerMessage,
} from '../proto/github.com/milaboratory/pl/plapi/plapiproto/api';
import {
  TxAPI_ClientMessage as ClientMessageType,
  TxAPI_ServerMessage as ServerMessageType,
} from '../proto/github.com/milaboratory/pl/plapi/plapiproto/api';
import type { BiDiStream } from './abstract_stream';
import Denque from 'denque';

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'closing' | 'closed';

interface QueuedMessage {
  message: TxAPI_ClientMessage;
  resolve: () => void;
  reject: (error: Error) => void;
}

/**
 * WebSocket-based bidirectional stream implementation for LLTransaction.
 * Implements BiDiStream interface which is compatible with DuplexStreamingCall.
 */
export class WebSocketBiDiStream implements BiDiStream<TxAPI_ClientMessage, TxAPI_ServerMessage> {
  private ws: WebSocket | null = null;
  private connectionState: ConnectionState = 'disconnected';
  private readonly url: string;
  private readonly abortSignal: AbortSignal;
  private readonly jwtToken?: string;
  
  private readonly sendQueue = new Denque<QueuedMessage>();
  private sendCompleted = false;
  
  private readonly responseQueue = new Denque<TxAPI_ServerMessage>();
  private responseResolvers: Array<{
    resolve: (value: IteratorResult<TxAPI_ServerMessage>) => void;
    reject: (error: Error) => void;
  }> = [];
  
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 10;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 100; // Start with 100ms
  
  private connectionError: Error | null = null;
  
  public readonly requests = {
    send: async (message: TxAPI_ClientMessage): Promise<void> => {
      if (this.sendCompleted) {
        throw new Error('Stream send side already completed');
      }
      
      if (this.abortSignal.aborted) {
        throw new Error('Stream aborted');
      }
      
      return new Promise<void>((resolve, reject) => {
        this.sendQueue.push({ message, resolve, reject });
        this.processSendQueue();
      });
    },
    
    complete: async (): Promise<void> => {
      if (this.sendCompleted) {
        return;
      }
      
      this.sendCompleted = true;
      
      // Wait for all queued messages to be sent
      while (this.sendQueue.length > 0) {
        await new Promise<void>((resolve) => {
          const checkQueue = () => {
            if (this.sendQueue.length === 0) {
              resolve();
            } else {
              setTimeout(checkQueue, 10);
            }
          };
          checkQueue();
        });
      }
      
      // Close the WebSocket if connected
      if (this.ws && this.connectionState === 'connected') {
        this.ws.close();
      }
    },
  };
  
  public readonly responses: AsyncIterable<TxAPI_ServerMessage> = {
    [Symbol.asyncIterator]: async function* (this: WebSocketBiDiStream) {
      while (true) {
        const result = await new Promise<IteratorResult<TxAPI_ServerMessage>>((resolve, reject) => {
          // Check if we have a queued message
          if (this.responseQueue.length > 0) {
            const message = this.responseQueue.shift()!;
            resolve({ value: message, done: false });
            return;
          }
          
          // Check if stream is closed
          if (this.connectionState === 'closed' || this.abortSignal.aborted) {
            if (this.connectionError) {
              reject(this.connectionError);
            } else {
              resolve({ value: undefined as any, done: true });
            }
            return;
          }
          
          // Wait for next message
          this.responseResolvers.push({ resolve, reject });
        });
        
        if (result.done) {
          break;
        }
        
        yield result.value;
      }
    }.bind(this),
  };
  
  constructor(url: string, abortSignal: AbortSignal, jwtToken?: string) {
    this.url = url;
    this.abortSignal = abortSignal;
    this.jwtToken = jwtToken;
    
    // Handle abort signal
    if (abortSignal.aborted) {
      this.connectionState = 'closed';
      return;
    }
    
    abortSignal.addEventListener('abort', () => {
      this.close();
    });
    
    // Start connection
    this.connect();
  }
  
  private async connect(): Promise<void> {
    if (this.connectionState === 'connected' || this.connectionState === 'connecting') {
      return;
    }
    
    if (this.abortSignal.aborted) {
      this.connectionState = 'closed';
      return;
    }
    
    this.connectionState = 'connecting';
    this.connectionError = null;
    
    try {
      // Pass JWT token as Authorization header (undici WebSocket supports headers via options)
      let ws: WebSocket;
      if (this.jwtToken) {
        // undici WebSocket supports headers in options object
        const options = {
          headers: {
            'authorization': `Bearer ${this.jwtToken}`,
          },
        };
        // Try with options as second parameter (undici extension)
        ws = new (WebSocket as any)(this.url, options);
      } else {
        ws = new WebSocket(this.url);
      }
      this.ws = ws;
      
      this.ws.addEventListener('open', () => {
        this.connectionState = 'connected';
        this.reconnectAttempts = 0;
        this.reconnectDelay = 100;
        this.processSendQueue();
      });
      
      this.ws.addEventListener('message', (event: { data: unknown }) => {
        this.handleMessage(event.data);
      });
      
      this.ws.addEventListener('error', (error: unknown) => {
        const err = error instanceof Error ? error : new Error(String(error));
        this.handleError(err);
      });
      
      this.ws.addEventListener('close', () => {
        this.handleClose();
      });
      
    } catch (error) {
      this.handleError(error as Error);
    }
  }
  
  private handleMessage(data: unknown): void {
    try {
      let message: TxAPI_ServerMessage;
      
      if (data instanceof ArrayBuffer || data instanceof Buffer || data instanceof Uint8Array) {
        // Binary protobuf message
        const buffer = data instanceof ArrayBuffer 
          ? new Uint8Array(data) 
          : data instanceof Buffer 
            ? new Uint8Array(data)
            : data;
        message = ServerMessageType.fromBinary(buffer);
      } else if (typeof data === 'string') {
        // JSON message (for testing)
        const json = JSON.parse(data);
        message = ServerMessageType.fromJson(json);
      } else {
        throw new Error(`Unsupported message type: ${typeof data}`);
      }
      
      // Check if we have a waiting resolver
      if (this.responseResolvers.length > 0) {
        const resolver = this.responseResolvers.shift()!;
        resolver.resolve({ value: message, done: false });
      } else {
        // Queue the message
        this.responseQueue.push(message);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      // Reject waiting resolvers
      while (this.responseResolvers.length > 0) {
        const resolver = this.responseResolvers.shift()!;
        resolver.reject(err);
      }
      this.connectionError = err;
    }
  }
  
  private handleError(error: Error): void {
    this.connectionError = error;
    
    // Reject all pending send operations
    while (this.sendQueue.length > 0) {
      const queued = this.sendQueue.shift()!;
      queued.reject(error);
    }
    
    // Reject waiting response resolvers
    while (this.responseResolvers.length > 0) {
      const resolver = this.responseResolvers.shift()!;
      resolver.reject(error);
    }
    
    // Attempt reconnection if not aborted
    if (!this.abortSignal.aborted && this.connectionState !== 'closed') {
      this.scheduleReconnect();
    }
  }
  
  private handleClose(): void {
    this.ws = null;
    
    if (this.connectionState === 'closed' || this.abortSignal.aborted) {
      return;
    }
    
    // If send is not completed, attempt reconnection
    if (!this.sendCompleted) {
      this.scheduleReconnect();
    } else {
      this.connectionState = 'closed';
      // Signal end of responses
      while (this.responseResolvers.length > 0) {
        const resolver = this.responseResolvers.shift()!;
        resolver.resolve({ value: undefined as any, done: true });
      }
    }
  }
  
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return; // Already scheduled
    }
    
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.connectionState = 'closed';
      const error = new Error('Max reconnection attempts reached');
      this.connectionError = error;
      
      // Reject all pending operations
      while (this.sendQueue.length > 0) {
        const queued = this.sendQueue.shift()!;
        queued.reject(error);
      }
      
      while (this.responseResolvers.length > 0) {
        const resolver = this.responseResolvers.shift()!;
        resolver.reject(error);
      }
      
      return;
    }
    
    this.connectionState = 'disconnected';
    this.reconnectAttempts++;
    
    // Exponential backoff
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);
    
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
  
  private async processSendQueue(): Promise<void> {
    if (this.connectionState !== 'connected' || !this.ws) {
      return;
    }
    
    while (this.sendQueue.length > 0) {
      const queued = this.sendQueue.shift()!;
      
      try {
        // Serialize message to binary (protobuf)
        const binary = ClientMessageType.toBinary(queued.message);
        
        // Send as binary message
        this.ws.send(binary);
        
        queued.resolve();
      } catch (error) {
        queued.reject(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }
  
  private close(): void {
    if (this.connectionState === 'closed') {
      return;
    }
    
    this.connectionState = 'closed';
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // Ignore errors during close
      }
      this.ws = null;
    }
    
    // Reject all pending operations
    const error = this.abortSignal.aborted 
      ? new Error('Stream aborted')
      : new Error('Stream closed');
    
    while (this.sendQueue.length > 0) {
      const queued = this.sendQueue.shift()!;
      queued.reject(error);
    }
    
    while (this.responseResolvers.length > 0) {
      const resolver = this.responseResolvers.shift()!;
      resolver.reject(error);
    }
  }
}

