import { tapIf } from '@/helpers/functions';

const cm = new WeakMap<Element, (entry: ResizeObserverEntry) => void>();

const resizeObserver = new ResizeObserver((entries) => {
  for (const entry of entries) {
    tapIf(cm.get(entry.target), (cb) => cb(entry));
  }
});

export function startResizeObserving(el: Element, cb: (entry: ResizeObserverEntry) => void) {
  cm.set(el, cb);
  resizeObserver.unobserve(el);
  resizeObserver.observe(el);
}

export function stopResizeObserving(el: Element) {
  resizeObserver.unobserve(el);
  cm.delete(el);
}
