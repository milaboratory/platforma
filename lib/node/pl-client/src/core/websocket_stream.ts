import { WebSocket } from 'undici';
import {
  TxAPI_ClientMessage as ClientMessageType,
  TxAPI_ServerMessage as ServerMessageType,
} from '../proto-grpc/github.com/milaboratory/pl/plapi/plapiproto/api';
import type { BiDiStream } from './abstract_stream';
import Denque from 'denque';
import type { RetryConfig } from '../helpers/retry_strategy';
import { RetryStrategy } from '../helpers/retry_strategy';

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'closing' | 'closed';

interface QueuedMessage {
  message: ClientMessageType;
  resolve: () => void;
  reject: (error: Error) => void;
}

interface ResponseResolver {
  resolve: (value: IteratorResult<ServerMessageType>) => void;
  reject: (error: Error) => void;
}

/**
 * WebSocket-based bidirectional stream implementation for LLTransaction.
 * Implements BiDiStream interface which is compatible with DuplexStreamingCall.
 */
export class WebSocketBiDiStream implements BiDiStream<ClientMessageType, ServerMessageType> {
  // Connection
  private ws: WebSocket | null = null;
  private connectionState: ConnectionState = 'disconnected';
  private readonly url: string;
  private readonly jwtToken?: string;
  private readonly abortSignal: AbortSignal;
  private readonly reconnection: RetryStrategy;

  // Send management
  private readonly sendQueue = new Denque<QueuedMessage>();
  private sendCompleted = false;

  // Response management
  private readonly responseQueue = new Denque<ServerMessageType>();
  private responseResolvers: ResponseResolver[] = [];

  // Error tracking
  private connectionError: Error | null = null;

  // === Public API ===

  public readonly requests = {
    send: async (message: ClientMessageType): Promise<void> => {
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

  public readonly responses: AsyncIterable<ServerMessageType> = {
    [Symbol.asyncIterator]: () => this.createResponseIterator(),
  };

  constructor(
    url: string,
    abortSignal: AbortSignal,
    jwtToken?: string,
    retryConfig: Partial<RetryConfig> = {},
  ) {
    this.url = url;
    this.jwtToken = jwtToken;
    this.abortSignal = abortSignal;

    this.reconnection = new RetryStrategy(retryConfig, {
      onRetry: () => this.connect(),
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
      this.attachWebSocketHandlers();
    } catch (error) {
      this.handleConnectionError(error as Error);
    }
  }

  private createWebSocket(): WebSocket {
    const options = this.jwtToken
      ? { headers: { authorization: `Bearer ${this.jwtToken}` } }
      : undefined;

    const ws = new (WebSocket as any)(this.url, options);
    if (ws) {
      ws.binaryType = 'arraybuffer';
    }
    return ws;
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
    this.reconnection.reset();
    this.processSendQueue();
  }

  private onClose(): void {
    this.ws = null;

    if (this.isClosed() || this.abortSignal.aborted) return;

    if (this.sendCompleted) {
      this.finalizeStream();
    } else {
      this.connectionState = 'disconnected';
      this.reconnection.schedule();
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
    this.reconnection.cancel();
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

  private parseMessage(data: unknown): ServerMessageType {
    if (data instanceof ArrayBuffer) {
      return ServerMessageType.fromBinary(new Uint8Array(data));
    }

    throw new Error(`Unsupported message format: ${typeof data}`);
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

  private enqueueSend(message: ClientMessageType): Promise<void> {
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
    return new Promise<void>((resolve, reject) => {
      if (this.abortSignal.aborted) {
        return reject(this.abortSignal.reason ?? new Error('Stream aborted'));
      }

      let timeoutId: ReturnType<typeof setTimeout>;
      const onAbort = () => {
        clearTimeout(timeoutId);
        reject(this.abortSignal.reason ?? new Error('Stream aborted'));
      };

      this.abortSignal.addEventListener('abort', onAbort, { once: true });

      const check = () => {
        if (condition() || this.isStreamEnded()) {
          this.abortSignal.removeEventListener('abort', onAbort);
          resolve();
        } else {
          timeoutId = setTimeout(check, intervalMs);
        }
      };

      check();
    });
  }

  // === Response Delivery ===

  private deliverResponse(message: ServerMessageType): void {
    if (this.responseResolvers.length > 0) {
      const resolver = this.responseResolvers.shift()!;
      resolver.resolve({ value: message, done: false });
    } else {
      this.responseQueue.push(message);
    }
  }

  private async *createResponseIterator(): AsyncIterator<ServerMessageType> {
    while (true) {
      const result = await this.nextResponse();

      if (result.done) break;

      yield result.value;
    }
  }

  private nextResponse(): Promise<IteratorResult<ServerMessageType>> {
    return new Promise<IteratorResult<ServerMessageType>>((resolve, reject) => {
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
  private handleMaxReconnectAttempts(error: Error): void {
    this.connectionState = 'closed';
    this.connectionError = error;
    this.rejectAllPendingOperations(error);
  }

  private handleConnectionError(error: Error): void {
    this.connectionError = error;
    this.rejectAllPendingOperations(error);

    if (!this.abortSignal.aborted && !this.isClosed()) {
      this.connectionState = 'disconnected';
      this.reconnection.schedule();
    }
  }

  private handleParseError(error: Error): void {
    if (this.isClosed()) return;

    this.connectionState = 'closed';
    this.connectionError = error;
    this.reconnection.cancel();
    this.closeWebSocket();
    this.rejectAllPendingOperations(error);
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
