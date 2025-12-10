import { WebSocket, type WebSocketInit, type Dispatcher, ErrorEvent } from 'undici';
import type { BiDiStream } from './abstract_stream';
import Denque from 'denque';
import type { RetryConfig } from '../helpers/retry_strategy';
import { RetryStrategy } from '../helpers/retry_strategy';

interface QueuedMessage<InType extends object> {
  message: InType;
  resolve: () => void;
  reject: (error: Error) => void;
}

interface ResponseResolver<OutType extends object> {
  resolve: (value: IteratorResult<OutType>) => void;
  reject: (error: Error) => void;
}

enum ConnectionState {
  NEW = 0,
  CONNECTING = 1,
  CONNECTED = 2,
  CLOSING = 3,
  CLOSED = 4,
}

export type WSStreamOptions<ClientMsg extends object, ServerMsg extends object> = {
  abortSignal?: AbortSignal;

  dispatcher?: Dispatcher;
  jwtToken?: string;
  retryConfig?: Partial<RetryConfig>;

  onComplete?: (stream: WebSocketBiDiStream<ClientMsg, ServerMsg>) => void | Promise<void>;
};

/**
 * WebSocket-based bidirectional stream implementation for LLTransaction.
 * Implements BiDiStream interface which is compatible with DuplexStreamingCall.
 */
export class WebSocketBiDiStream<ClientMsg extends object, ServerMsg extends object> implements BiDiStream<ClientMsg, ServerMsg> {
  // Connection
  private ws: WebSocket | null = null;
  private connectionState: ConnectionState = ConnectionState.NEW;
  private readonly reconnection: RetryStrategy;

  // Send management
  private readonly sendQueue = new Denque<QueuedMessage<ClientMsg>>();
  private sendCompleted = false;
  private readonly onComplete: (stream: WebSocketBiDiStream<ClientMsg, ServerMsg>) => void | Promise<void>;

  // Response management
  private readonly responseQueue = new Denque<ServerMsg>();
  private responseResolvers: ResponseResolver<ServerMsg>[] = [];

  // Error tracking
  private lastError?: Error;

  // === Public API ===

  public readonly requests = {
    send: async (message: ClientMsg): Promise<void> => {
      return await this.enqueueSend(message);
    },

    complete: async (): Promise<void> => {
      if (this.sendCompleted) return;

      await this.drainSendQueue(); // ensure we sent all already queued messages before closing the stream
      try {
        await this.onComplete(this); // custom onComplete may send additional messages
      } catch (_: unknown) {
        // When 'complete' gets called concurrently with connection break or over a broken
        // transaction stream (server decided it should drop transaction), server would close
        // connection anyway on its end. We can safely ignore error here and just continue working.
      }
      this.sendCompleted = true;
    },
  };

  public readonly responses: AsyncIterable<ServerMsg> = {
    [Symbol.asyncIterator]: () => this.createResponseIterator(),
  };

  public close(): void {
    this.reconnection.cancel();

    if (this.connectionState < ConnectionState.CONNECTED) {
      // Never reached CONNECTED state. ws.close() will never trigger 'close' event.
      this.ws?.close();
      this.onClose();
      return;
    }

    if (!this.progressConnectionState(ConnectionState.CLOSING)) return;
    this.ws!.close();
  }

  constructor(
    private readonly url: string,
    private readonly serializeClientMessage: (message: ClientMsg) => Uint8Array,
    private readonly parseServerMessage: (data: Uint8Array) => ServerMsg,
    private readonly options: WSStreamOptions<ClientMsg, ServerMsg> = {},
  ) {
    this.onComplete = this.options.onComplete ?? ((stream) => stream.close());

    const retryConfig = this.options.retryConfig ?? {};
    this.reconnection = new RetryStrategy(retryConfig, {
      onRetry: () => { void this.connect(); },
      onMaxAttemptsReached: (error) => this.handleError(error),
    });

    if (this.options.abortSignal?.aborted) {
      this.progressConnectionState(ConnectionState.CLOSED);
      return;
    }

    this.options.abortSignal?.addEventListener('abort', () => this.close());
    this.connect();
  }

  // === Connection Lifecycle ===

  private connect(): void {
    if (this.options.abortSignal?.aborted) return;

    // Prevent reconnecting after first successful connection.
    if (!this.progressConnectionState(ConnectionState.CONNECTING)) return;

    try {
      this.ws = this.createWebSocket();

      this.ws.addEventListener('open', () => this.onOpen());
      this.ws.addEventListener('message', (event) => this.onMessage(event.data));
      this.ws.addEventListener('error', (error) => this.onError(error));
      this.ws.addEventListener('close', () => this.onClose());
    } catch (error) {
      this.lastError = this.toError(error);
      this.reconnection.schedule();
    }
  }

  private createWebSocket(): WebSocket {
    const options: WebSocketInit = {};

    if (this.options.jwtToken) options.headers = { authorization: `Bearer ${this.options.jwtToken}` };
    if (this.options.dispatcher) options.dispatcher = this.options.dispatcher;

    const ws = new WebSocket(this.url, options);
    ws.binaryType = 'arraybuffer';
    return ws;
  }

  private onOpen(): void {
    this.progressConnectionState(ConnectionState.CONNECTED);
    this.processSendQueue();
  }

  private onMessage(data: unknown): void {
    if (!(data instanceof ArrayBuffer)) {
      this.handleError(new Error(`Unexpected WS message format: ${typeof data}`));
      return;
    }

    try {
      const message = this.parseServerMessage(new Uint8Array(data));
      this.deliverResponse(message);
    } catch (error) {
      this.handleError(this.toError(error));
    }
  }

  private onError(error: unknown): void {
    if (this.connectionState < ConnectionState.CONNECTED) {
      // Try to connect several times until we succeed or run out of attempts.
      this.lastError = this.toError(error);
      this.reconnection.schedule();
      return;
    }

    this.handleError(this.toError(error));
  }

  private onClose(): void {
    this.progressConnectionState(ConnectionState.CLOSED);

    // If abort signal was triggered, use that as the error source
    if (this.options.abortSignal?.aborted && !this.lastError) {
      const reason = this.options.abortSignal.reason;
      if (reason instanceof Error) {
        this.lastError = reason;
      } else if (reason !== undefined) {
        this.lastError = new Error(String(reason), { cause: reason });
      } else {
        this.lastError = this.createStreamClosedError();
      }
    }

    if (!this.lastError) {
      this.rejectAllSendOperations(this.createStreamClosedError());
      this.resolveAllPendingResponses(); // unblock active async iterator
    } else {
      this.rejectAllPendingOperations(this.lastError);
    }
  }

  // === Send Queue Management ===

  private enqueueSend(message: ClientMsg): Promise<void> {
    if (this.sendCompleted) {
      throw new Error('Cannot send: stream already completed');
    }

    if (this.options.abortSignal?.aborted) {
      throw new Error('Cannot send: stream aborted');
    }

    return new Promise<void>((resolve, reject) => {
      this.sendQueue.push({ message, resolve, reject });
      this.processSendQueue();
    });
  }

  private processSendQueue(): void {
    if (!this.canSendMessages()) return;

    while (this.sendQueue.length > 0) {
      const queued = this.sendQueue.shift()!;
      this.sendQueuedMessage(queued);
    }
  }

  private canSendMessages(): boolean {
    return this.connectionState === ConnectionState.CONNECTED;
  }

  private sendQueuedMessage(queued: QueuedMessage<ClientMsg>): void {
    try {
      // Check if stream was closed or aborted before sending
      if (this.connectionState === ConnectionState.CLOSED) {
        if (this.lastError) {
          queued.reject(this.lastError);
        } else if (this.options.abortSignal?.aborted) {
          const reason = this.options.abortSignal.reason;
          queued.reject(reason instanceof Error ? reason : new Error('Stream aborted', { cause: reason }));
        } else {
          queued.reject(this.createStreamClosedError());
        }
        return;
      }

      const ws = this.ws;
      if (!ws) {
        throw new Error('WebSocket is not connected');
      }

      // Check if WebSocket is in a valid state for sending
      if (ws.readyState !== WebSocket.OPEN) {
        throw new Error(`WebSocket is not open (readyState: ${ws.readyState})`);
      }

      const binary = this.serializeClientMessage(queued.message);
      ws.send(binary);
      queued.resolve();
    } catch (error) {
      queued.reject(this.toError(error));
    }
  }

  private async drainSendQueue(): Promise<void> {
    const POLL_INTERVAL_MS = 5;

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
      if (this.options.abortSignal?.aborted) {
        return reject(this.toError(this.options.abortSignal.reason) ?? new Error('Stream aborted'));
      }

      let timeoutId: ReturnType<typeof setTimeout>;
      const onAbort = () => {
        clearTimeout(timeoutId);
        reject(this.toError(this.options.abortSignal?.reason) ?? new Error('Stream aborted'));
      };

      this.options.abortSignal?.addEventListener('abort', onAbort, { once: true });

      const check = () => {
        if (condition() || this.isStreamEnded()) {
          this.options.abortSignal?.removeEventListener('abort', onAbort);
          resolve();
        } else {
          timeoutId = setTimeout(check, intervalMs);
        }
      };

      check();
    });
  }

  // === Response Delivery ===

  private deliverResponse(message: ServerMsg): void {
    if (this.responseResolvers.length > 0) {
      const resolver = this.responseResolvers.shift()!;
      resolver.resolve({ value: message, done: false });
    } else {
      this.responseQueue.push(message);
    }
  }

  private async *createResponseIterator(): AsyncIterator<ServerMsg> {
    while (true) {
      const result = await this.nextResponse();

      if (result.done) break;

      yield result.value;
    }
  }

  private nextResponse(): Promise<IteratorResult<ServerMsg>> {
    return new Promise<IteratorResult<ServerMsg>>((resolve, reject) => {
      // Fast path: message already available
      if (this.responseQueue.length > 0) {
        const message = this.responseQueue.shift()!;
        resolve({ value: message, done: false });
        return;
      }

      // Stream ended
      if (this.isStreamEnded()) {
        if (this.lastError) {
          reject(this.lastError);
        } else if (this.options.abortSignal?.aborted) {
          // If aborted but no lastError set, create error from abort reason
          const reason = this.options.abortSignal.reason;
          if (reason instanceof Error) {
            reject(reason);
          } else {
            reject(new Error('Stream aborted', { cause: reason }));
          }
        } else {
          resolve({ value: undefined as any, done: true });
        }
        return;
      }

      // Wait for next message
      this.responseResolvers.push({ resolve, reject });
    });
  }

  private resolveAllPendingResponses(): void {
    while (this.responseResolvers.length > 0) {
      const resolver = this.responseResolvers.shift()!;
      resolver.resolve({ value: undefined as any, done: true });
    }
  }

  // === Error Handling ===

  private handleError(error: Error): void {
    this.lastError = error;
    this.close();
  }

  private rejectAllPendingOperations(error: Error): void {
    this.rejectAllSendOperations(error);
    this.rejectAllResponseResolvers(error);
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
    if (this.options.abortSignal?.aborted) {
      const reason = this.options.abortSignal.reason;
      if (reason instanceof Error) {
        return reason;
      }
      return new Error('Stream aborted', { cause: reason });
    }

    return new Error('Stream closed');
  }

  // === Helpers ===

  private isStreamEnded(): boolean {
    return this.connectionState === ConnectionState.CLOSED || this.options.abortSignal?.aborted || false;
  }

  private toError(error: unknown): Error {
    if (error instanceof Error) {
      // Handle empty error messages from undici WebSocket
      if (!error.message && error.name) {
        return new Error(`${error.name}`, { cause: error });
      }
      return error;
    }
    if (error instanceof ErrorEvent) {
      const err = error.error;
      if (err instanceof Error) {
        if (!err.message && err.name) {
          return new Error(`${err.name}`, { cause: err });
        }
        return err;
      }
      return new Error('WebSocket error', { cause: error });
    }
    return new Error(String(error) || 'Unknown error');
  }

  /**
   * Connection state progresses linearly from NEW to CLOSED and never goes back.
   * This internal contract dramatically simplifies the internal stream state management.
   *
   * If you ever feel the need to make this contract less strict, think twice.
   */
  private progressConnectionState(newState: ConnectionState): boolean {
    if (newState < this.connectionState) {
      return false;
    }
    this.connectionState = newState;
    return true;
  }
}
