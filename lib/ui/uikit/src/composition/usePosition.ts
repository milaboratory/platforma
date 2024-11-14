import { type Ref, onMounted } from 'vue';
import { useEventListener } from '@/composition/useEventListener';
import { requestTick } from '@/helpers/utils';
import type { ElementPosition } from '@/types';

export function useElementPosition(el: Ref<HTMLElement | undefined>, cb: (pos: ElementPosition) => void) {
  const update = () => {
    if (el.value) {
      const { scrollTop, scrollLeft, scrollHeight, scrollWidth, clientHeight, clientWidth } = document.documentElement;
      const rect = el.value.getBoundingClientRect();
      cb({
        scrollTop,
        scrollLeft,
        scrollHeight,
        scrollWidth,
        clientHeight,
        clientWidth,
        offsetY: scrollTop + rect.y,
        offsetX: scrollLeft + rect.x,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        x: rect.x,
        y: rect.y,
      });
    }
  };

  const handle = requestTick(update);

  onMounted(handle);

  useEventListener(window, 'scroll', handle, { capture: true, passive: true });

  useEventListener(window, 'resize', handle, { passive: true });

  useEventListener(window, 'adjust', handle, true);
}
