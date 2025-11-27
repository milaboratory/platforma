import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  TxAPI_ClientMessage as ClientMessageType,
  TxAPI_ServerMessage as ServerMessageType,
} from '../proto-grpc/github.com/milaboratory/pl/plapi/plapiproto/api';

// Mock WebSocket - must be hoisted for vi.mock
const MockWebSocket = vi.hoisted(() => {
  class MockWS {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;

    readyState = 0;
    binaryType = 'blob';

    private listeners: Map<string, Set<Function>> = new Map();

    constructor(
      public url: string,
      public options?: { headers?: Record<string, string> },
    ) {
      MockWS.instances.push(this);
    }

    static instances: MockWS[] = [];

    static reset() {
      MockWS.instances = [];
    }

    addEventListener(event: string, callback: Function) {
      if (!this.listeners.has(event)) {
        this.listeners.set(event, new Set());
      }
      this.listeners.get(event)!.add(callback);
    }

    removeEventListener(event: string, callback: Function) {
      this.listeners.get(event)?.delete(callback);
    }

    emit(event: string, data?: unknown) {
      this.listeners.get(event)?.forEach((cb) => cb(data));
    }

    send = vi.fn();
    close = vi.fn(() => {
      this.readyState = MockWS.CLOSED;
      this.emit('close');
    });

    simulateOpen() {
      this.readyState = MockWS.OPEN;
      this.emit('open');
    }

    simulateMessage(data: ArrayBuffer) {
      this.emit('message', { data });
    }

    simulateError(error: Error) {
      this.emit('error', error);
    }

    simulateClose() {
      this.readyState = MockWS.CLOSED;
      this.emit('close');
    }
  }
  return MockWS;
});

vi.mock('undici', () => ({
  WebSocket: MockWebSocket,
}));

import { WebSocketBiDiStream } from './websocket_stream';
import type { RetryConfig } from '../helpers/retry_strategy';

type MockWS = InstanceType<typeof MockWebSocket>;

interface StreamContext {
  stream: WebSocketBiDiStream;
  ws: MockWS;
  controller: AbortController;
}

function createStream(token?: string, retryConfig?: Partial<RetryConfig>): StreamContext {
  const controller = new AbortController();
  const stream = new WebSocketBiDiStream(
    'ws://localhost:8080',
    controller.signal,
    token,
    retryConfig,
  );
  const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
  return { stream, ws, controller };
}

async function openConnection(ws: MockWS): Promise<void> {
  ws.simulateOpen();
  await vi.runAllTimersAsync();
}

function createServerMessageBuffer(): ArrayBuffer {
  const message = ServerMessageType.create({});
  const binary = ServerMessageType.toBinary(message);
  return binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength) as ArrayBuffer;
}

function createClientMessage(): ClientMessageType {
  return ClientMessageType.create({});
}

async function collectMessages(
  stream: WebSocketBiDiStream,
  count: number,
): Promise<ServerMessageType[]> {
  const messages: ServerMessageType[] = [];
  for await (const msg of stream.responses) {
    messages.push(msg);
    if (messages.length >= count) break;
  }
  return messages;
}

describe('WebSocketBiDiStream', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.reset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    test('should pass JWT token in authorization header', () => {
      createStream('test-token');

      expect(MockWebSocket.instances[0].options?.headers?.authorization).toBe(
        'Bearer test-token',
      );
    });

    test('should not create WebSocket if already aborted', () => {
      const controller = new AbortController();
      controller.abort();

      new WebSocketBiDiStream('ws://localhost:8080', controller.signal);

      expect(MockWebSocket.instances).toHaveLength(0);
    });
  });

  describe('send messages', () => {
    test('should queue message and send when connected', async () => {
      const { stream, ws } = createStream();

      const sendPromise = stream.requests.send(createClientMessage());
      expect(ws.send).not.toHaveBeenCalled();

      await openConnection(ws);
      await sendPromise;

      expect(ws.send).toHaveBeenCalledTimes(1);
    });

    test('should throw error when sending after complete', async () => {
      const { stream, ws } = createStream();

      await openConnection(ws);
      await stream.requests.complete();

      await expect(stream.requests.send(createClientMessage())).rejects.toThrow(
        'Cannot send: stream already completed',
      );
    });

    test('should throw error when sending after abort', async () => {
      const { stream, ws, controller } = createStream();

      await openConnection(ws);
      controller.abort();

      await expect(stream.requests.send(createClientMessage())).rejects.toThrow(
        'Cannot send: stream aborted',
      );
    });
  });

  describe('receive messages', () => {
    test('should receive messages via async iterator', async () => {
      const { stream, ws } = createStream();

      await openConnection(ws);

      const buffer = createServerMessageBuffer();
      const responsePromise = collectMessages(stream, 2);

      ws.simulateMessage(buffer);
      ws.simulateMessage(buffer);

      const messages = await responsePromise;
      expect(messages).toHaveLength(2);
    });

    test('should buffer messages when no consumer', async () => {
      const { stream, ws } = createStream();

      await openConnection(ws);

      const buffer = createServerMessageBuffer();
      ws.simulateMessage(buffer);
      ws.simulateMessage(buffer);

      const messages = await collectMessages(stream, 2);
      expect(messages).toHaveLength(2);
    });

    test('should end iterator when stream completes', async () => {
      const { stream, ws } = createStream();

      await openConnection(ws);

      const iteratorPromise = (async () => {
        const messages: ServerMessageType[] = [];
        for await (const msg of stream.responses) {
          messages.push(msg);
        }
        return messages;
      })();

      await stream.requests.complete();

      const messages = await iteratorPromise;
      expect(messages).toHaveLength(0);
    });
  });

  describe('complete', () => {
    test('should close WebSocket after complete', async () => {
      const { stream, ws } = createStream();

      await openConnection(ws);
      await stream.requests.complete();

      expect(ws.close).toHaveBeenCalled();
    });

    test('should be idempotent', async () => {
      const { stream, ws } = createStream();

      await openConnection(ws);
      await stream.requests.complete();
      await stream.requests.complete();
      await stream.requests.complete();

      expect(ws.close).toHaveBeenCalledTimes(1);
    });

    test('should drain send queue before closing', async () => {
      const { stream, ws } = createStream();

      const sendPromise1 = stream.requests.send(createClientMessage());
      const sendPromise2 = stream.requests.send(createClientMessage());
      const completePromise = stream.requests.complete();

      await openConnection(ws);

      await sendPromise1;
      await sendPromise2;
      await completePromise;

      expect(ws.send).toHaveBeenCalledTimes(2);
    });
  });

  describe('abort signal', () => {
    test('should close stream when aborted', async () => {
      const { ws, controller } = createStream();

      await openConnection(ws);
      controller.abort();

      expect(ws.close).toHaveBeenCalled();
    });

    test('should reject pending sends when aborted', async () => {
      const { stream, controller } = createStream();

      const sendPromise = stream.requests.send(createClientMessage());
      sendPromise.catch(() => {});

      controller.abort();
      await vi.runAllTimersAsync();

      await expect(sendPromise).rejects.toThrow();
    });

    test('should end response iterator when aborted', async () => {
      const { stream, ws, controller } = createStream();

      await openConnection(ws);

      const iteratorPromise = (async () => {
        const messages: ServerMessageType[] = [];
        try {
          for await (const msg of stream.responses) {
            messages.push(msg);
          }
        } catch {
          // Expected to throw on abort
        }
        return messages;
      })();

      controller.abort();
      await vi.runAllTimersAsync();

      const messages = await iteratorPromise;
      expect(messages).toHaveLength(0);
    });
  });

  describe('reconnection', () => {
    const retryConfig: Partial<RetryConfig> = {
      initialDelay: 50,
      maxDelay: 100,
      maxAttempts: 5,
    };

    test('should attempt reconnection on connection error', async () => {
      const { ws } = createStream(undefined, retryConfig);

      ws.simulateError(new Error('Connection failed'));
      await vi.advanceTimersByTimeAsync(150);

      expect(MockWebSocket.instances.length).toBeGreaterThan(1);
    });

    test('should attempt reconnection on unexpected close', async () => {
      const { ws } = createStream(undefined, retryConfig);

      await openConnection(ws);

      ws.readyState = MockWebSocket.CLOSED;
      ws.emit('close');
      await vi.advanceTimersByTimeAsync(150);

      expect(MockWebSocket.instances.length).toBeGreaterThan(1);
    });

    test('should reset retry count on successful connection', async () => {
      createStream(undefined, retryConfig);
      let ws = MockWebSocket.instances[0];

      ws.simulateError(new Error('Connection failed'));
      await vi.advanceTimersByTimeAsync(150);

      ws = MockWebSocket.instances[1];
      await openConnection(ws);

      ws.readyState = MockWebSocket.CLOSED;
      ws.emit('close');
      await vi.advanceTimersByTimeAsync(150);

      expect(MockWebSocket.instances.length).toBeGreaterThan(2);
    });

    test('should stop reconnecting after max attempts', async () => {
      createStream(undefined, { maxAttempts: 3, initialDelay: 10, maxDelay: 100 });

      for (let i = 0; i < 5; i++) {
        const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
        ws.simulateError(new Error('Connection failed'));
        await vi.advanceTimersByTimeAsync(200);
      }

      expect(MockWebSocket.instances.length).toBeLessThanOrEqual(4);
    });

    test('should not reconnect after complete', async () => {
      const { stream, ws } = createStream();

      await openConnection(ws);
      await stream.requests.complete();
      await vi.advanceTimersByTimeAsync(1000);

      expect(MockWebSocket.instances).toHaveLength(1);
    });
  });

  describe('error handling', () => {
    test('should reject response iterator on parse error', async () => {
      const { stream, ws } = createStream();

      await openConnection(ws);

      const iterator = stream.responses[Symbol.asyncIterator]();
      const nextPromise = iterator.next();

      await Promise.resolve();

      const invalidData = new Uint8Array([
        0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x01,
      ]);
      ws.simulateMessage(invalidData.buffer);

      await expect(nextPromise).rejects.toThrow();
    });

    test('should throw on unsupported message format', async () => {
      const { stream, ws } = createStream();

      await openConnection(ws);

      const iteratorPromise = (async () => {
        try {
          for await (const _ of stream.responses) {
            // Should not reach here
          }
          return 'completed';
        } catch (e) {
          return e;
        }
      })();

      ws.emit('message', { data: 'not a buffer' });

      const result = await iteratorPromise;
      expect(result).toBeInstanceOf(Error);
    });
  });

});
