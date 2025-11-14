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

// === Types ===

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

// === WebSocket BiDi Stream ===

/**
 * WebSocket-based bidirectional stream implementation for LLTransaction.
 * Implements BiDiStream interface which is compatible with DuplexStreamingCall.
 */
export class WebSocketBiDiStream implements BiDiStream<TxAPI_ClientMessage, TxAPI_ServerMessage> {
  // Connection
  private ws: WebSocket | null = null;
  private connectionState: ConnectionState = 'disconnected';
  private readonly url: string;
  private readonly jwtToken?: string;
  private readonly abortSignal: AbortSignal;

  // Send management
  private readonly sendQueue = new Denque<QueuedMessage>();
  private sendCompleted = false;

  // Response management
  private readonly responseQueue = new Denque<TxAPI_ServerMessage>();
  private responseResolvers: ResponseResolver[] = [];

  // Reconnection
  private reconnectAttempts = 0;
  private readonly reconnectConfig: ReconnectConfig;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  // Error tracking
  private connectionError: Error | null = null;

  // === Public API ===

  public readonly requests = {
    send: async (message: TxAPI_ClientMessage): Promise<void> => {
      this.validateSendState();
      return this.enqueueSend(message);
    },

    complete: async (): Promise<void> => {
      if (this.sendCompleted) return;

      this.sendCompleted = true;
      await this.drainSendQueue();
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
    reconnectConfig: Partial<ReconnectConfig> = {},
  ) {
    this.url = url;
    this.jwtToken = jwtToken;
    this.abortSignal = abortSignal;

    this.reconnectConfig = { ...DEFAULT_RECONNECT_CONFIG, ...reconnectConfig };

    if (abortSignal.aborted) {
      this.connectionState = 'closed';
      return;
    }

    this.attachAbortSignalHandler();
    this.connect();
  }

  // === Connection Lifecycle ===

  private async connect(): Promise<void> {
    if (this.isConnectingOrConnected() || this.abortSignal.aborted) return;

    this.connectionState = 'connecting';
    this.connectionError = null;

    try {
      this.ws = this.createWebSocket();
      this.attachWebSocketHandlers();
    } catch (error) {
      this.handleConnectionError(error as Error);
    }
  }

  private createWebSocket(): WebSocket {
    const options = this.jwtToken
      ? { headers: { authorization: `Bearer ${this.jwtToken}` } }
      : undefined;

    return new (WebSocket as any)(this.url, options);
  }

  private attachWebSocketHandlers(): void {
    if (!this.ws) return;

    this.ws.addEventListener('open', () => this.onOpen());
    this.ws.addEventListener('message', (event) => this.onMessage(event.data));
    this.ws.addEventListener('error', (error) => this.onError(error));
    this.ws.addEventListener('close', () => this.onClose());
  }

  private attachAbortSignalHandler(): void {
    this.abortSignal.addEventListener('abort', () => this.close());
  }

  private onOpen(): void {
    this.connectionState = 'connected';
    this.reconnectAttempts = 0;
    this.processSendQueue();
  }

  private onClose(): void {
    this.ws = null;

    if (this.isClosed() || this.abortSignal.aborted) return;

    if (this.sendCompleted) {
      this.finalizeStream();
    } else {
      this.attemptReconnect();
    }
  }

  private onError(error: unknown): void {
    this.handleConnectionError(this.toError(error));
  }

  private onMessage(data: unknown): void {
    try {
      const message = this.parseMessage(data);
      this.deliverResponse(message);
    } catch (error) {
      this.handleParseError(this.toError(error));
    }
  }

  private closeConnection(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
  }

  private close(): void {
    if (this.isClosed()) return;

    this.connectionState = 'closed';
    this.cancelReconnectTimer();
    this.closeWebSocket();
    this.rejectAllPendingOperations();
  }

  private closeWebSocket(): void {
    if (!this.ws) return;

    try {
      this.ws.close();
    } catch {
      // Suppress close errors
    }

    this.ws = null;
  }

  private finalizeStream(): void {
    this.connectionState = 'closed';
    this.resolveAllPendingResponses();
  }

  private resolveAllPendingResponses(): void {
    while (this.responseResolvers.length > 0) {
      const resolver = this.responseResolvers.shift()!;
      resolver.resolve({ value: undefined as any, done: true });
    }
  }

  // === Reconnection Strategy ===

  private attemptReconnect(): void {
    if (this.reconnectTimer || this.hasExceededReconnectLimit()) {
      if (this.hasExceededReconnectLimit()) {
        this.failWithMaxReconnectAttempts();
      }
      return;
    }

    this.connectionState = 'disconnected';
    this.reconnectAttempts++;

    const delay = this.computeReconnectDelay();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private computeReconnectDelay(): number {
    const exponentialDelay
      = this.reconnectConfig.initialDelay * Math.pow(2, this.reconnectAttempts - 1);
    return Math.min(exponentialDelay, this.reconnectConfig.maxDelay);
  }

  private cancelReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private hasExceededReconnectLimit(): boolean {
    return this.reconnectAttempts >= this.reconnectConfig.maxAttempts;
  }

  private failWithMaxReconnectAttempts(): void {
    this.connectionState = 'closed';
    const error = new Error(
      `Max reconnection attempts (${this.reconnectConfig.maxAttempts}) reached`,
    );
    this.connectionError = error;
    this.rejectAllPendingOperations(error);
  }

  // === Message Parsing ===

  private parseMessage(data: unknown): TxAPI_ServerMessage {
    if (this.isBinaryData(data)) {
      return this.parseBinary(data);
    }

    if (typeof data === 'string') {
      return this.parseJson(data);
    }

    throw new Error(`Unsupported message format: ${typeof data}`);
  }

  private isBinaryData(data: unknown): data is ArrayBuffer | Buffer | Uint8Array {
    return data instanceof ArrayBuffer
      || data instanceof Buffer
      || data instanceof Uint8Array;
  }

  private parseBinary(data: ArrayBuffer | Buffer | Uint8Array): TxAPI_ServerMessage {
    const uint8Array = this.toUint8Array(data);
    return ServerMessageType.fromBinary(uint8Array);
  }

  private toUint8Array(data: ArrayBuffer | Buffer | Uint8Array): Uint8Array {
    if (data instanceof Uint8Array) return data;
    if (data instanceof Buffer) return new Uint8Array(data);
    return new Uint8Array(data);
  }

  private parseJson(data: string): TxAPI_ServerMessage {
    const json = JSON.parse(data);
    return ServerMessageType.fromJson(json);
  }

  // === Send Queue Management ===

  private validateSendState(): void {
    if (this.sendCompleted) {
      throw new Error('Cannot send: stream already completed');
    }

    if (this.abortSignal.aborted) {
      throw new Error('Cannot send: stream aborted');
    }
  }

  private enqueueSend(message: TxAPI_ClientMessage): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.sendQueue.push({ message, resolve, reject });
      this.processSendQueue();
    });
  }

  private async processSendQueue(): Promise<void> {
    if (!this.canSendMessages()) return;

    while (this.sendQueue.length > 0) {
      const queued = this.sendQueue.shift()!;
      await this.sendQueuedMessage(queued);
    }
  }

  private canSendMessages(): boolean {
    return this.connectionState === 'connected' && this.ws !== null;
  }

  private async sendQueuedMessage(queued: QueuedMessage): Promise<void> {
    try {
      const binary = ClientMessageType.toBinary(queued.message);
      this.ws!.send(binary);
      queued.resolve();
    } catch (error) {
      queued.reject(this.toError(error));
    }
  }

  private async drainSendQueue(): Promise<void> {
    const POLL_INTERVAL_MS = 10;

    while (this.sendQueue.length > 0) {
      await this.waitForCondition(
        () => this.sendQueue.length === 0,
        POLL_INTERVAL_MS,
      );
    }
  }

  private waitForCondition(
    condition: () => boolean,
    intervalMs: number,
  ): Promise<void> {
    return new Promise<void>((resolve) => {
      const check = () => {
        if (condition()) {
          resolve();
        } else {
          setTimeout(check, intervalMs);
        }
      };
      check();
    });
  }

  // === Response Delivery ===

  private deliverResponse(message: TxAPI_ServerMessage): void {
    if (this.responseResolvers.length > 0) {
      const resolver = this.responseResolvers.shift()!;
      resolver.resolve({ value: message, done: false });
    } else {
      this.responseQueue.push(message);
    }
  }

  private async *createResponseIterator(): AsyncIterator<TxAPI_ServerMessage> {
    while (true) {
      const result = await this.nextResponse();

      if (result.done) break;

      yield result.value;
    }
  }

  private nextResponse(): Promise<IteratorResult<TxAPI_ServerMessage>> {
    return new Promise<IteratorResult<TxAPI_ServerMessage>>((resolve, reject) => {
      // Fast path: message already available
      if (this.responseQueue.length > 0) {
        const message = this.responseQueue.shift()!;
        resolve({ value: message, done: false });
        return;
      }

      // Stream ended
      if (this.isStreamEnded()) {
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
  }

  // === Error Handling ===

  private handleConnectionError(error: Error): void {
    this.connectionError = error;
    this.rejectAllPendingOperations(error);

    if (!this.abortSignal.aborted && !this.isClosed()) {
      this.attemptReconnect();
    }
  }

  private handleParseError(error: Error): void {
    this.connectionError = error;
    this.rejectAllResponseResolvers(error);
  }

  private rejectAllPendingOperations(error?: Error): void {
    const err = error ?? this.createStreamClosedError();
    this.rejectAllSendOperations(err);
    this.rejectAllResponseResolvers(err);
  }

  private rejectAllSendOperations(error: Error): void {
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

  private createStreamClosedError(): Error {
    return this.abortSignal.aborted
      ? new Error('Stream aborted')
      : new Error('Stream closed');
  }

  // === State Checks ===

  private isConnectingOrConnected(): boolean {
    return this.connectionState === 'connecting'
      || this.connectionState === 'connected';
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
