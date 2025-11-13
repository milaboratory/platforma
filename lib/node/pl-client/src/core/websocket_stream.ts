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

interface ResponseResolver {
  resolve: (value: IteratorResult<TxAPI_ServerMessage>) => void;
  reject: (error: Error) => void;
}

interface ReconnectConfig {
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
}

const DEFAULT_RECONNECT_CONFIG: ReconnectConfig = {
  maxAttempts: 10,
  initialDelay: 100,
  maxDelay: 30000,
};

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
  private responseResolvers: ResponseResolver[] = [];
  
  private reconnectAttempts = 0;
  private readonly reconnectConfig: ReconnectConfig;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  
  private connectionError: Error | null = null;
  
  public readonly requests = {
    send: async (message: TxAPI_ClientMessage): Promise<void> => {
      this.validateSendState();
      return this.enqueueSend(message);
    },
    
    complete: async (): Promise<void> => {
      if (this.sendCompleted) return;
      
      this.sendCompleted = true;
      await this.waitForSendQueueDrain();
      this.closeConnection();
    },
  };
  
  public readonly responses: AsyncIterable<TxAPI_ServerMessage> = {
    [Symbol.asyncIterator]: () => this.createResponseIterator(),
  };
  
  constructor(
    url: string,
    abortSignal: AbortSignal,
    jwtToken?: string,
    reconnectConfig: Partial<ReconnectConfig> = {}
  ) {
    this.url = url;
    this.abortSignal = abortSignal;
    this.jwtToken = jwtToken;
    this.reconnectConfig = { ...DEFAULT_RECONNECT_CONFIG, ...reconnectConfig };
    
    if (abortSignal.aborted) {
      this.connectionState = 'closed';
      return;
    }
    
    this.setupAbortHandler();
    this.connect();
  }
  
  // === Connection Management ===
  
  private async connect(): Promise<void> {
    if (this.isConnectingOrConnected() || this.abortSignal.aborted) return;
    
    this.connectionState = 'connecting';
    this.connectionError = null;
    
    try {
      this.ws = this.createWebSocket();
      this.setupWebSocketHandlers();
    } catch (error) {
      this.handleError(error as Error);
    }
  }
  
  private createWebSocket(): WebSocket {
    if (!this.jwtToken) {
      return new WebSocket(this.url);
    }
    
    const options = {
      headers: {
        'authorization': `Bearer ${this.jwtToken}`,
      },
    };
    
    return new (WebSocket as any)(this.url, options);
  }
  
  private setupWebSocketHandlers(): void {
    if (!this.ws) return;
    
    this.ws.addEventListener('open', () => this.handleOpen());
    this.ws.addEventListener('message', (event) => this.handleMessage(event.data));
    this.ws.addEventListener('error', (error) => this.handleError(this.toError(error)));
    this.ws.addEventListener('close', () => this.handleClose());
  }
  
  private handleOpen(): void {
    this.connectionState = 'connected';
    this.resetReconnection();
    this.processSendQueue();
  }
  
  private handleClose(): void {
    this.ws = null;
    
    if (this.isClosed() || this.abortSignal.aborted) return;
    
    if (this.sendCompleted) {
      this.finalizeClosure();
    } else {
      this.scheduleReconnect();
    }
  }
  
  private closeConnection(): void {
    if (this.ws && this.connectionState === 'connected') {
      this.ws.close();
    }
  }
  
  private close(): void {
    if (this.isClosed()) return;
    
    this.connectionState = 'closed';
    this.clearReconnectTimer();
    this.closeWebSocket();
    this.rejectAllPending();
  }
  
  private closeWebSocket(): void {
    if (!this.ws) return;
    
    try {
      this.ws.close();
    } catch {
      // Ignore errors during close
    }
    this.ws = null;
  }
  
  private finalizeClosure(): void {
    this.connectionState = 'closed';
    
    while (this.responseResolvers.length > 0) {
      const resolver = this.responseResolvers.shift()!;
      resolver.resolve({ value: undefined as any, done: true });
    }
  }
  
  // === Reconnection Logic ===
  
  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.hasExceededMaxAttempts()) {
      if (this.hasExceededMaxAttempts()) {
        this.handleMaxReconnectAttemptsReached();
      }
      return;
    }
    
    this.connectionState = 'disconnected';
    this.reconnectAttempts++;
    
    const delay = this.calculateReconnectDelay();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
  
  private calculateReconnectDelay(): number {
    const exponentialDelay = 
      this.reconnectConfig.initialDelay * Math.pow(2, this.reconnectAttempts - 1);
    return Math.min(exponentialDelay, this.reconnectConfig.maxDelay);
  }
  
  private resetReconnection(): void {
    this.reconnectAttempts = 0;
  }
  
  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
  
  private hasExceededMaxAttempts(): boolean {
    return this.reconnectAttempts >= this.reconnectConfig.maxAttempts;
  }
  
  private handleMaxReconnectAttemptsReached(): void {
    this.connectionState = 'closed';
    const error = new Error('Max reconnection attempts reached');
    this.connectionError = error;
    this.rejectAllPending(error);
  }
  
  // === Message Handling ===
  
  private handleMessage(data: unknown): void {
    try {
      const message = this.deserializeMessage(data);
      this.enqueueResponse(message);
    } catch (error) {
      this.handleDeserializationError(this.toError(error));
    }
  }
  
  private deserializeMessage(data: unknown): TxAPI_ServerMessage {
    if (this.isBinaryData(data)) {
      return this.deserializeBinary(data);
    }
    
    if (typeof data === 'string') {
      return this.deserializeJson(data);
    }
    
    throw new Error(`Unsupported message type: ${typeof data}`);
  }
  
  private isBinaryData(data: unknown): data is ArrayBuffer | Buffer | Uint8Array {
    return data instanceof ArrayBuffer || 
           data instanceof Buffer || 
           data instanceof Uint8Array;
  }
  
  private deserializeBinary(data: ArrayBuffer | Buffer | Uint8Array): TxAPI_ServerMessage {
    const buffer = data instanceof ArrayBuffer 
      ? new Uint8Array(data) 
      : data instanceof Buffer 
        ? new Uint8Array(data)
        : data;
    
    return ServerMessageType.fromBinary(buffer);
  }
  
  private deserializeJson(data: string): TxAPI_ServerMessage {
    const json = JSON.parse(data);
    return ServerMessageType.fromJson(json);
  }
  
  private enqueueResponse(message: TxAPI_ServerMessage): void {
    if (this.responseResolvers.length > 0) {
      const resolver = this.responseResolvers.shift()!;
      resolver.resolve({ value: message, done: false });
    } else {
      this.responseQueue.push(message);
    }
  }
  
  private handleDeserializationError(error: Error): void {
    this.rejectAllResponseResolvers(error);
    this.connectionError = error;
  }
  
  // === Send Queue Management ===
  
  private validateSendState(): void {
    if (this.sendCompleted) {
      throw new Error('Stream send side already completed');
    }
    
    if (this.abortSignal.aborted) {
      throw new Error('Stream aborted');
    }
  }
  
  private enqueueSend(message: TxAPI_ClientMessage): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.sendQueue.push({ message, resolve, reject });
      this.processSendQueue();
    });
  }
  
  private async processSendQueue(): Promise<void> {
    if (!this.canProcessSendQueue()) return;
    
    while (this.sendQueue.length > 0) {
      const queued = this.sendQueue.shift()!;
      await this.sendMessage(queued);
    }
  }
  
  private canProcessSendQueue(): boolean {
    return this.connectionState === 'connected' && this.ws !== null;
  }
  
  private async sendMessage(queued: QueuedMessage): Promise<void> {
    try {
      const binary = ClientMessageType.toBinary(queued.message);
      this.ws!.send(binary);
      queued.resolve();
    } catch (error) {
      queued.reject(this.toError(error));
    }
  }
  
  private async waitForSendQueueDrain(): Promise<void> {
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
  }
  
  // === Response Iterator ===
  
  private async *createResponseIterator(): AsyncIterator<TxAPI_ServerMessage> {
    while (true) {
      const result = await this.getNextResponse();
      
      if (result.done) break;
      
      yield result.value;
    }
  }
  
  private getNextResponse(): Promise<IteratorResult<TxAPI_ServerMessage>> {
    return new Promise<IteratorResult<TxAPI_ServerMessage>>((resolve, reject) => {
      if (this.responseQueue.length > 0) {
        const message = this.responseQueue.shift()!;
        resolve({ value: message, done: false });
        return;
      }
      
      if (this.isStreamEnded()) {
        if (this.connectionError) {
          reject(this.connectionError);
        } else {
          resolve({ value: undefined as any, done: true });
        }
        return;
      }
      
      this.responseResolvers.push({ resolve, reject });
    });
  }
  
  // === Error Handling ===
  
  private handleError(error: Error): void {
    this.connectionError = error;
    this.rejectAllPending(error);
    
    if (!this.abortSignal.aborted && !this.isClosed()) {
      this.scheduleReconnect();
    }
  }
  
  private rejectAllPending(error?: Error): void {
    const err = error || this.createClosureError();
    this.rejectAllSendQueue(err);
    this.rejectAllResponseResolvers(err);
  }
  
  private rejectAllSendQueue(error: Error): void {
    while (this.sendQueue.length > 0) {
      const queued = this.sendQueue.shift()!;
      queued.reject(error);
    }
  }
  
  private rejectAllResponseResolvers(error: Error): void {
    while (this.responseResolvers.length > 0) {
      const resolver = this.responseResolvers.shift()!;
      resolver.reject(error);
    }
  }
  
  private createClosureError(): Error {
    return this.abortSignal.aborted 
      ? new Error('Stream aborted')
      : new Error('Stream closed');
  }
  
  // === Utility Methods ===
  
  private setupAbortHandler(): void {
    this.abortSignal.addEventListener('abort', () => this.close());
  }
  
  private isConnectingOrConnected(): boolean {
    return this.connectionState === 'connecting' || 
           this.connectionState === 'connected';
  }
  
  private isClosed(): boolean {
    return this.connectionState === 'closed';
  }
  
  private isStreamEnded(): boolean {
    return this.isClosed() || this.abortSignal.aborted;
  }
  
  private toError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
  }
}