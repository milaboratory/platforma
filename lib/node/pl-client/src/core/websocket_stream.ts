import { WebSocket } from 'undici';
import type {
  TxAPI_ClientMessage,
  TxAPI_ServerMessage,
} from '../proto-grpc/github.com/milaboratory/pl/plapi/plapiproto/api';
import {
  TxAPI_ClientMessage as ClientMessageType,
  TxAPI_ServerMessage as ServerMessageType,
} from '../proto-grpc/github.com/milaboratory/pl/plapi/plapiproto/api';
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

// === Reconnect Strategy ===

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

interface ReconnectCallbacks {
  onReconnect: () => void;
  onMaxAttemptsReached: (error: Error) => void;
}

/**
 * Encapsulates reconnection logic with exponential backoff.
 */
class ReconnectStrategy {
  private attempts = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly config: ReconnectConfig;
  private readonly callbacks: ReconnectCallbacks;

  constructor(config: ReconnectConfig, callbacks: ReconnectCallbacks) {
    this.config = config;
    this.callbacks = callbacks;
  }

  schedule(): void {
    if (this.timer || this.hasExceededLimit()) {
      if (this.hasExceededLimit()) {
        this.notifyMaxAttemptsReached();
      }
      return;
    }

    this.attempts++;
    const delay = this.computeDelay();

    this.timer = setTimeout(() => {
      this.timer = null;
      this.callbacks.onReconnect();
    }, delay);
  }

  cancel(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  reset(): void {
    this.attempts = 0;
  }

  private computeDelay(): number {
    const exponentialDelay = this.config.initialDelay * Math.pow(2, this.attempts - 1);
    return Math.min(exponentialDelay, this.config.maxDelay);
  }

  private hasExceededLimit(): boolean {
    return this.attempts >= this.config.maxAttempts;
  }

  private notifyMaxAttemptsReached(): void {
    const error = new Error(
      `Max reconnection attempts (${this.config.maxAttempts}) reached`,
    );
    this.callbacks.onMaxAttemptsReached(error);
  }
}

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
  private readonly reconnectStrategy: ReconnectStrategy;

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

    const config = { ...DEFAULT_RECONNECT_CONFIG, ...reconnectConfig };
    this.reconnectStrategy = new ReconnectStrategy(config, {
      onReconnect: () => this.connect(),
      onMaxAttemptsReached: (error) => this.handleMaxReconnectAttempts(error),
    });

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
      this.ws.binaryType = 'arraybuffer';
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
    this.reconnectStrategy.reset();
    this.processSendQueue();
  }

  private onClose(): void {
    this.ws = null;

    if (this.isClosed() || this.abortSignal.aborted) return;

    if (this.sendCompleted) {
      this.finalizeStream();
    } else {
      this.connectionState = 'disconnected';
      this.reconnectStrategy.schedule();
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
    this.reconnectStrategy.cancel();
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

  // === Reconnection Callback ===

  private handleMaxReconnectAttempts(error: Error): void {
    this.connectionState = 'closed';
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

  private isBinaryData(data: unknown): data is ArrayBuffer | Blob {
    return data instanceof ArrayBuffer
        || data instanceof Blob;
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
      const ws = this.ws;
      if (!ws) {
        throw new Error('WebSocket is not connected');
      }

      // Check if WebSocket is in a valid state for sending
      if (ws.readyState !== WebSocket.OPEN) {
        throw new Error(`WebSocket is not open (readyState: ${ws.readyState})`);
      }

      // Handle backpressure: wait if buffer is too full
      // Maximum buffer size is typically 16MB, but we'll be conservative
      const MAX_BUFFERED_AMOUNT = 8 * 1024 * 1024; // 8MB
      while (ws.bufferedAmount > MAX_BUFFERED_AMOUNT) {
        await new Promise<void>((resolve) => {
          const checkBuffer = () => {
            if (ws.bufferedAmount <= MAX_BUFFERED_AMOUNT || ws.readyState !== WebSocket.OPEN) {
              resolve();
            } else {
              // Check again after a short delay
              setTimeout(checkBuffer, 10);
            }
          };
          checkBuffer();
        });

        // If WebSocket closed while waiting, throw error
        if (ws.readyState !== WebSocket.OPEN) {
          throw new Error(`WebSocket closed while waiting for buffer to drain (readyState: ${ws.readyState})`);
        }
      }

      const binary = ClientMessageType.toBinary(queued.message);
      ws.send(binary);
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
      this.connectionState = 'disconnected';
      this.reconnectStrategy.schedule();
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
