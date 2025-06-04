import type { Ref } from 'vue';
import { ref } from 'vue';
import { useEventListener } from './useEventListener';
import type { MaybeRef } from '../types';

export interface UseElementHoverOptions {
  delayEnter?: number;
  delayLeave?: number;
}

export function useHover(el: MaybeRef<EventTarget | undefined>, options: UseElementHoverOptions = {}): Ref<boolean> {
  const { delayEnter = 0, delayLeave = 0 } = options;

  const isHovered = ref(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  const toggle = (entering: boolean) => {
    const delay = entering ? delayEnter : delayLeave;

    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }

    if (delay) timer = setTimeout(() => (isHovered.value = entering), delay);
    else isHovered.value = entering;
  };

  if (!window) return isHovered;

  useEventListener(el, 'mouseenter', () => toggle(true));
  useEventListener(el, 'mouseleave', () => toggle(false));

  return isHovered;
}
