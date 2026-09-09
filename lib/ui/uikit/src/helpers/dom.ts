import { animate, makeEaseOut } from "./utils";

export { downloadContent } from "./downloadContent";

export function isElementVisible(parent: HTMLElement, el: HTMLElement) {
  const scrollTop = parent.scrollTop;
  const parentHeight = parent.getBoundingClientRect().height;
  const elOffsetTop = el.offsetTop;
  const elHeight = el.getBoundingClientRect().height;
  return elOffsetTop + elHeight < parentHeight + scrollTop && elOffsetTop > scrollTop;
}

export function getElementScrollPosition(parent: HTMLElement, el: HTMLElement) {
  const scrollTop = parent.scrollTop;
  const parentHeight = parent.getBoundingClientRect().height;
  const elOffsetTop = el.offsetTop;
  const elHeight = el.getBoundingClientRect().height;

  if (elOffsetTop + elHeight < parentHeight + scrollTop) {
    return "ceil" as const;
  }

  if (elOffsetTop > scrollTop) {
    return "floor" as const;
  }

  return "visible" as const;
}

export function scrollIntoView(
  parent: HTMLElement,
  el: HTMLElement,
  options: { duration?: number } = {},
) {
  const scrollTop = parent.scrollTop;
  const parentHeight = parent.getBoundingClientRect().height;
  const elHeight = el.getBoundingClientRect().height;
  const offsetTop = el.offsetTop;
  const scrollPosition = getElementScrollPosition(parent, el);

  if (scrollPosition === "visible") {
    return;
  }

  const draw = (progress: number) => {
    const to = scrollPosition === "floor" ? offsetTop - (parentHeight - elHeight) : offsetTop;
    parent.scrollTop = scrollTop + progress * (to - scrollTop);
  };

  if (!isElementVisible(parent, el)) {
    animate({
      duration: options.duration || 100,
      timing: makeEaseOut((t) => t),
      draw,
    });
  }
}

export function eventListener<K extends keyof DocumentEventMap>(
  el: Document,
  type: K,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  listener: (this: Document, ev: DocumentEventMap[K]) => any,
  options?: boolean | AddEventListenerOptions,
): () => void;

export function eventListener<K extends keyof HTMLElementEventMap>(
  el: HTMLElement,
  type: K,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  listener: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any,
  options?: boolean | AddEventListenerOptions,
): () => void;

export function eventListener<K extends string>(
  el: HTMLElement | Document,
  type: K,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  listener: (this: HTMLElement | Document, ev: unknown) => any,
  options?: boolean | AddEventListenerOptions,
) {
  el.addEventListener(type, listener, options);

  return function () {
    el.removeEventListener(type, listener);
  };
}

export function detectOutside(e: { x: number; y: number }, el: HTMLElement) {
  const rect = el.getBoundingClientRect();
  return e.x < rect.x || e.x > rect.x + rect.width || e.y < rect.y || e.y > rect.y + rect.height;
}

/**
 * True when `el` or any of its descendants clips its content horizontally,
 * i.e. the text is cut with an ellipsis and not fully visible.
 */
export function hasTextOverflow(el: HTMLElement | undefined | null): boolean {
  if (!el) return false;
  if (el.scrollWidth > el.clientWidth) return true;
  for (const child of el.querySelectorAll<HTMLElement>("*")) {
    if (child.scrollWidth > child.clientWidth) return true;
  }
  return false;
}
