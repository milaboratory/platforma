/**
 * jsdom has no layout, so nothing is ever resized. The polyfill scheduled animation-frame refreshes
 * that could fire after a test file's window was torn down, failing the run on `_location` of null.
 */
class InertResizeObserver implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = InertResizeObserver;
