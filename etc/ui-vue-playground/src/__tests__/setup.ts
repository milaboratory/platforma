import ResizeObserver from 'resize-observer-polyfill';
import { vi } from 'vitest';

global.ResizeObserver = ResizeObserver;

// Mock the Worker global for tests
class MockedComlinkWorker {
  private listeners = new Map<string, EventListenerOrEventListenerObject[]>();
  public onmessage: ((this: never, ev: MessageEvent) => never) | null = null;
  public onerror: ((this: never, ev: ErrorEvent) => never) | null = null;

  constructor(_stringUrl: string | URL, _options?: WorkerOptions) {
    // The stringUrl for inline workers is a data URL (e.g., "data:text/javascript;base64,...")
    // We don't need to do anything with it for this mock.
  }

  postMessage(_message: never, _transfer?: Transferable[]): void {
    // Comlink sends an initial message with a port. For this mock,
    // we don't need to simulate a full handshake. The key is that the call doesn't fail
    // and that the `wrap` function in `chemical-properties.ts` can attach its listeners.
    // If specific tests actually rely on worker *responses*, this mock would need to be smarter
    // or those specific worker functions would need more targeted mocking.
  }

  terminate(): void {
    // No-op for the mock
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject, _options?: boolean | AddEventListenerOptions): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type)!.push(listener);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject, _options?: boolean | EventListenerOptions): void {
    const typeListeners = this.listeners.get(type);
    if (typeListeners) {
      const index = typeListeners.indexOf(listener);
      if (index > -1) {
        typeListeners.splice(index, 1);
      }
    }
  }

  dispatchEvent(event: Event): boolean {
    const typeListeners = this.listeners.get(event.type);
    if (typeListeners) {
      typeListeners.forEach((listener) => {
        if (typeof listener === 'function') {
          listener(event);
        } else {
          listener.handleEvent(event);
        }
      });
    }
    return !event.defaultPrevented;
  }
}

global.Worker = vi.fn((scriptURL, options) => new MockedComlinkWorker(scriptURL, options)) as never;
