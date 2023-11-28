import {animate, makeEaseOut} from '@/lib/helpers/utils';

export function isElementVisible(parent: HTMLElement, el: HTMLElement) {
  const scrollTop = parent.scrollTop;
  const parentHeight = parent.getBoundingClientRect().height;
  const elOffsetTop = el.offsetTop;
  const elHeight = el.getBoundingClientRect().height;
  return ((elOffsetTop + elHeight) < parentHeight + scrollTop) && (elOffsetTop > scrollTop);
}

export function getElementScrollPosition(parent: HTMLElement, el: HTMLElement) {
  const scrollTop = parent.scrollTop;
  const parentHeight = parent.getBoundingClientRect().height;
  const elOffsetTop = el.offsetTop;
  const elHeight = el.getBoundingClientRect().height;

  if ((elOffsetTop + elHeight) < parentHeight + scrollTop) {
    return 'ceil' as const;
  }

  if (elOffsetTop > scrollTop) {
    return 'floor' as const;
  }

  return 'visible' as const;
}

export function scrollIntoView(parent: HTMLElement, el: HTMLElement, options: {duration?: number} = {}) {
  const scrollTop = parent.scrollTop;
  const parentHeight = parent.getBoundingClientRect().height;
  const elHeight = el.getBoundingClientRect().height;
  const offsetTop = el.offsetTop;
  const scrollPosition = getElementScrollPosition(parent, el);

  if (scrollPosition === 'visible') {
    return;
  }

  const draw = (progress: number) => {
    const to = scrollPosition === 'floor' ? offsetTop - (parentHeight - elHeight) : offsetTop;
    parent.scrollTop = scrollTop + progress * (to - scrollTop);
  }

  if (!isElementVisible(parent, el)) {
    animate({
      duration: options.duration || 300,
      timing: makeEaseOut(t => t),
      draw
    });
  }
}

export function eventListener<K extends keyof DocumentEventMap>(
  el: Document,
  type: K,
  listener: (this: Document, ev: DocumentEventMap[K]) => any,
  options?: boolean | AddEventListenerOptions): () => void;

export function eventListener<K extends keyof HTMLElementEventMap>(
  el: HTMLElement,
  type: K,
  listener: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any,
  options?: boolean | AddEventListenerOptions
): () => void;

export function eventListener<K extends string>(
  el: HTMLElement | Document,
  type: K,
  listener: (this: HTMLElement | Document, ev: unknown) => any,
  options?: boolean | AddEventListenerOptions
) {
  el.addEventListener(type, listener, options);

  return function () {
    el.removeEventListener(type, listener);
  }
}

export function detectOutside(e: {x: number, y: number}, el: HTMLElement) {
  const rect = el.getBoundingClientRect();
  return e.x < rect.x || e.x > (rect.x + rect.width) || e.y < rect.y || e.y > (rect.y + rect.height)
}
