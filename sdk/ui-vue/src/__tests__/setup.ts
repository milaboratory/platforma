import ResizeObserver from "resize-observer-polyfill";
globalThis.ResizeObserver = ResizeObserver;

// CSS.paintWorklet is not available in jsdom — uikit's PlPlaceholder
// accesses it at module load time.
if (typeof globalThis.CSS === "undefined") {
  (globalThis as Record<string, unknown>).CSS = { paintWorklet: { addModule: () => {} } };
} else if (!("paintWorklet" in globalThis.CSS)) {
  (globalThis.CSS as Record<string, unknown>).paintWorklet = { addModule: () => {} };
}
