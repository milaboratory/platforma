import { onMounted, onUnmounted, unref } from 'vue';
import type { MaybeRef } from '../types';

type EventMap = WindowEventMap & HTMLElementEventMap & { adjust: Event };

export function useEventListener<T extends EventTarget, E extends EventMap[K], K extends keyof EventMap>(
  target: MaybeRef<T | undefined>,
  type: K,
  callback: (this: T, evt: E) => void,
  options?: AddEventListenerOptions | boolean,
) {
  onMounted(() => unref(target)?.addEventListener(type, callback as (this: T, evt: Event) => void, options));
  onUnmounted(() => unref(target)?.removeEventListener(type, callback as (this: T, evt: Event) => void, options));
}
