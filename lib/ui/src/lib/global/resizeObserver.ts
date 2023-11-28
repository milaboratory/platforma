import {tapIf} from '@/lib/helpers/functions';

const cm = new WeakMap<Element, () => void>;

const resizeObserver = new ResizeObserver((entries) => {
  for (const entry of entries) {
    tapIf(cm.get(entry.target), cb => cb());
  }
});

export function onResizeElement(el: Element, cb: () => void) {
  cm.set(el, cb);
  resizeObserver.unobserve(el);
  resizeObserver.observe(el);
}

export function unobserve(el: Element) {
  resizeObserver.unobserve(el);
}
