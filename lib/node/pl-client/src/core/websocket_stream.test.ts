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

    readyState = 0; // CONNECTING
    bufferedAmount = 0;
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

function createAbortController(): AbortController {
  return new AbortController();
}

function createServerMessage(): { message: ServerMessageType; binary: Uint8Array } {
  const message = ServerMessageType.create({});
  const binary = ServerMessageType.toBinary(message);
  return { message, binary };
}

function createClientMessage(): ClientMessageType {
  return ClientMessageType.create({});
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
    test('should create WebSocket connection on initialization', () => {
      const controller = createAbortController();
      new WebSocketBiDiStream('ws://localhost:8080', controller.signal);

      expect(MockWebSocket.instances).toHaveLength(1);
      expect(MockWebSocket.instances[0].url).toBe('ws://localhost:8080');
    });

    test('should pass JWT token in authorization header', () => {
      const controller = createAbortController();
      new WebSocketBiDiStream('ws://localhost:8080', controller.signal, 'test-token');

      expect(MockWebSocket.instances[0].options?.headers?.authorization).toBe(
        'Bearer test-token',
      );
    });

    test('should not create WebSocket if already aborted', () => {
      const controller = createAbortController();
      controller.abort();

      new WebSocketBiDiStream('ws://localhost:8080', controller.signal);

      expect(MockWebSocket.instances).toHaveLength(0);
    });

    test('should set binaryType to arraybuffer', () => {
      const controller = createAbortController();
      new WebSocketBiDiStream('ws://localhost:8080', controller.signal);

      expect(MockWebSocket.instances[0].binaryType).toBe('arraybuffer');
    });
  });

  describe('send messages', () => {
    test('should queue message and send when connected', async () => {
      const controller = createAbortController();
      const stream = new WebSocketBiDiStream('ws://localhost:8080', controller.signal);
      const ws = MockWebSocket.instances[0];

      const message = createClientMessage();
      const sendPromise = stream.requests.send(message);

      // Message is queued, not sent yet
      expect(ws.send).not.toHaveBeenCalled();

      // Simulate connection
      ws.simulateOpen();
      await vi.runAllTimersAsync();

      await sendPromise;
      expect(ws.send).toHaveBeenCalledTimes(1);
    });

    test('should send message immediately if already connected', async () => {
      const controller = createAbortController();
      const stream = new WebSocketBiDiStream('ws://localhost:8080', controller.signal);
      const ws = MockWebSocket.instances[0];

      ws.simulateOpen();
      await vi.runAllTimersAsync();

      const message = createClientMessage();
      await stream.requests.send(message);

      expect(ws.send).toHaveBeenCalledTimes(1);
    });

    test('should throw error when sending after complete', async () => {
      const controller = createAbortController();
      const stream = new WebSocketBiDiStream('ws://localhost:8080', controller.signal);
      const ws = MockWebSocket.instances[0];

      ws.simulateOpen();
      await vi.runAllTimersAsync();

      await stream.requests.complete();

      await expect(stream.requests.send(createClientMessage())).rejects.toThrow(
        'Cannot send: stream already completed',
      );
    });

    test('should throw error when sending after abort', async () => {
      const controller = createAbortController();
      const stream = new WebSocketBiDiStream('ws://localhost:8080', controller.signal);
      const ws = MockWebSocket.instances[0];

      ws.simulateOpen();
      await vi.runAllTimersAsync();

      controller.abort();

      await expect(stream.requests.send(createClientMessage())).rejects.toThrow(
        'Cannot send: stream aborted',
      );
    });

    test('should send multiple messages in order', async () => {
      const controller = createAbortController();
      const stream = new WebSocketBiDiStream('ws://localhost:8080', controller.signal);
      const ws = MockWebSocket.instances[0];

      ws.simulateOpen();
      await vi.runAllTimersAsync();

      await stream.requests.send(createClientMessage());
      await stream.requests.send(createClientMessage());
      await stream.requests.send(createClientMessage());

      expect(ws.send).toHaveBeenCalledTimes(3);
    });
  });

  describe('receive messages', () => {
    test('should receive messages via async iterator', async () => {
      const controller = createAbortController();
      const stream = new WebSocketBiDiStream('ws://localhost:8080', controller.signal);
      const ws = MockWebSocket.instances[0];

      ws.simulateOpen();
      await vi.runAllTimersAsync();

      const { binary } = createServerMessage();
      const arrayBuffer = binary.buffer.slice(
        binary.byteOffset,
        binary.byteOffset + binary.byteLength,
      );

      const responsePromise = (async () => {
        const messages: ServerMessageType[] = [];
        for await (const msg of stream.responses) {
          messages.push(msg);
          if (messages.length === 2) break;
        }
        return messages;
      })();

      ws.simulateMessage(arrayBuffer);
      ws.simulateMessage(arrayBuffer);

      const messages = await responsePromise;
      expect(messages).toHaveLength(2);
    });

    test('should buffer messages when no consumer', async () => {
      const controller = createAbortController();
      const stream = new WebSocketBiDiStream('ws://localhost:8080', controller.signal);
      const ws = MockWebSocket.instances[0];

      ws.simulateOpen();
      await vi.runAllTimersAsync();

      const { binary } = createServerMessage();
      const arrayBuffer = binary.buffer.slice(
        binary.byteOffset,
        binary.byteOffset + binary.byteLength,
      );

      // Send messages before consuming
      ws.simulateMessage(arrayBuffer);
      ws.simulateMessage(arrayBuffer);

      // Now consume
      const messages: ServerMessageType[] = [];
      for await (const msg of stream.responses) {
        messages.push(msg);
        if (messages.length === 2) break;
      }

      expect(messages).toHaveLength(2);
    });

    test('should end iterator when stream completes', async () => {
      const controller = createAbortController();
      const stream = new WebSocketBiDiStream('ws://localhost:8080', controller.signal);
      const ws = MockWebSocket.instances[0];

      ws.simulateOpen();
      await vi.runAllTimersAsync();

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
      const controller = createAbortController();
      const stream = new WebSocketBiDiStream('ws://localhost:8080', controller.signal);
      const ws = MockWebSocket.instances[0];

      ws.simulateOpen();
      await vi.runAllTimersAsync();

      await stream.requests.complete();

      expect(ws.close).toHaveBeenCalled();
    });

    test('should be idempotent', async () => {
      const controller = createAbortController();
      const stream = new WebSocketBiDiStream('ws://localhost:8080', controller.signal);
      const ws = MockWebSocket.instances[0];

      ws.simulateOpen();
      await vi.runAllTimersAsync();

      await stream.requests.complete();
      await stream.requests.complete();
      await stream.requests.complete();

      expect(ws.close).toHaveBeenCalledTimes(1);
    });

    test('should drain send queue before closing', async () => {
      const controller = createAbortController();
      const stream = new WebSocketBiDiStream('ws://localhost:8080', controller.signal);
      const ws = MockWebSocket.instances[0];

      // Queue messages before connection
      const sendPromise1 = stream.requests.send(createClientMessage());
      const sendPromise2 = stream.requests.send(createClientMessage());

      // Start complete (should wait for queue to drain)
      const completePromise = stream.requests.complete();

      // Connect and process queue
      ws.simulateOpen();
      await vi.runAllTimersAsync();

      await sendPromise1;
      await sendPromise2;
      await completePromise;

      expect(ws.send).toHaveBeenCalledTimes(2);
    });
  });

  describe('abort signal', () => {
    test('should close stream when aborted', async () => {
      const controller = createAbortController();
      const stream = new WebSocketBiDiStream('ws://localhost:8080', controller.signal);
      const ws = MockWebSocket.instances[0];

      ws.simulateOpen();
      await vi.runAllTimersAsync();

      controller.abort();

      expect(ws.close).toHaveBeenCalled();
    });

    test('should reject pending sends when aborted', async () => {
      const controller = createAbortController();
      const stream = new WebSocketBiDiStream('ws://localhost:8080', controller.signal);

      const sendPromise = stream.requests.send(createClientMessage());

      // Add catch to prevent unhandled rejection warning
      sendPromise.catch(() => {});

      controller.abort();
      await vi.runAllTimersAsync();

      await expect(sendPromise).rejects.toThrow();
    });

    test('should end response iterator when aborted', async () => {
      const controller = createAbortController();
      const stream = new WebSocketBiDiStream('ws://localhost:8080', controller.signal);
      const ws = MockWebSocket.instances[0];

      ws.simulateOpen();
      await vi.runAllTimersAsync();

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
    test('should attempt reconnection on connection error', async () => {
      const controller = createAbortController();
      new WebSocketBiDiStream('ws://localhost:8080', controller.signal, undefined, {
        initialDelay: 50,
        maxDelay: 100,
        maxAttempts: 5,
      });
      const ws = MockWebSocket.instances[0];

      ws.simulateError(new Error('Connection failed'));

      // Wait for retry delay (initialDelay * factor with jitter)
      await vi.advanceTimersByTimeAsync(150);

      expect(MockWebSocket.instances.length).toBeGreaterThan(1);
    });

    test('should attempt reconnection on unexpected close', async () => {
      const controller = createAbortController();
      new WebSocketBiDiStream('ws://localhost:8080', controller.signal, undefined, {
        initialDelay: 50,
        maxDelay: 100,
        maxAttempts: 5,
      });
      const ws = MockWebSocket.instances[0];

      ws.simulateOpen();
      await vi.runAllTimersAsync();

      // Simulate unexpected close
      ws.readyState = MockWebSocket.CLOSED;
      ws.emit('close');

      await vi.advanceTimersByTimeAsync(150);

      expect(MockWebSocket.instances.length).toBeGreaterThan(1);
    });

    test('should reset retry count on successful connection', async () => {
      const controller = createAbortController();
      new WebSocketBiDiStream('ws://localhost:8080', controller.signal, undefined, {
        initialDelay: 50,
        maxDelay: 100,
        maxAttempts: 5,
      });
      let ws = MockWebSocket.instances[0];

      // Fail first connection
      ws.simulateError(new Error('Connection failed'));
      await vi.advanceTimersByTimeAsync(150);

      // Second attempt succeeds
      ws = MockWebSocket.instances[1];
      ws.simulateOpen();
      await vi.runAllTimersAsync();

      // Now fail again - should start from initial delay
      ws.readyState = MockWebSocket.CLOSED;
      ws.emit('close');

      await vi.advanceTimersByTimeAsync(150);

      expect(MockWebSocket.instances.length).toBeGreaterThan(2);
    });

    test('should stop reconnecting after max attempts', async () => {
      const controller = createAbortController();
      new WebSocketBiDiStream('ws://localhost:8080', controller.signal, undefined, {
        maxAttempts: 3,
        initialDelay: 10,
        maxDelay: 100,
      });

      // Fail all attempts
      for (let i = 0; i < 5; i++) {
        const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
        ws.simulateError(new Error('Connection failed'));
        await vi.advanceTimersByTimeAsync(200);
      }

      // Should stop at max attempts (initial + 3 retries = 4)
      expect(MockWebSocket.instances.length).toBeLessThanOrEqual(4);
    });

    test('should not reconnect after complete', async () => {
      const controller = createAbortController();
      const stream = new WebSocketBiDiStream('ws://localhost:8080', controller.signal);
      const ws = MockWebSocket.instances[0];

      ws.simulateOpen();
      await vi.runAllTimersAsync();

      await stream.requests.complete();

      await vi.advanceTimersByTimeAsync(1000);

      expect(MockWebSocket.instances).toHaveLength(1);
    });
  });

  describe('error handling', () => {
    test('should reject response iterator on parse error', async () => {
      const controller = createAbortController();
      const stream = new WebSocketBiDiStream('ws://localhost:8080', controller.signal);
      const ws = MockWebSocket.instances[0];

      ws.simulateOpen();
      await vi.runAllTimersAsync();

      // Get iterator manually
      const iterator = stream.responses[Symbol.asyncIterator]();

      // Start waiting for next value
      const nextPromise = iterator.next();

      // Allow promise to register
      await Promise.resolve();

      // Send invalid protobuf data (truncated varint)
      const invalidData = new Uint8Array([0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x01]);
      ws.simulateMessage(invalidData.buffer);

      await expect(nextPromise).rejects.toThrow();
    });

    test('should throw on unsupported message format', async () => {
      const controller = createAbortController();
      const stream = new WebSocketBiDiStream('ws://localhost:8080', controller.signal);
      const ws = MockWebSocket.instances[0];

      ws.simulateOpen();
      await vi.runAllTimersAsync();

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

      // Send string instead of ArrayBuffer
      ws.emit('message', { data: 'not a buffer' });

      const result = await iteratorPromise;
      expect(result).toBeInstanceOf(Error);
    });
  });

  describe('backpressure handling', () => {
    test('should wait when buffer is full', async () => {
      const controller = createAbortController();
      const stream = new WebSocketBiDiStream('ws://localhost:8080', controller.signal);
      const ws = MockWebSocket.instances[0];

      ws.simulateOpen();
      await vi.runAllTimersAsync();

      // Simulate high buffer
      ws.bufferedAmount = 10 * 1024 * 1024; // 10MB

      const sendPromise = stream.requests.send(createClientMessage());

      // Send should not complete immediately
      await vi.advanceTimersByTimeAsync(5);
      expect(ws.send).not.toHaveBeenCalled();

      // Reduce buffer
      ws.bufferedAmount = 0;
      await vi.advanceTimersByTimeAsync(20);

      await sendPromise;
      expect(ws.send).toHaveBeenCalled();
    });
  });
});

