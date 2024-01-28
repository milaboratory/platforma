import { type Ref, onMounted } from 'vue';
import { useEventListener } from '@/lib/composition/useEventListener';
import { requestTick } from '@/lib/helpers/utils';
import type { Position } from '@/lib/types';

export function usePosition(el: Ref<HTMLElement | undefined>, cb: (pos: Position) => void) {
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

  useEventListener(window, 'scroll', handle, true);

  useEventListener(window, 'resize', handle, true);

  useEventListener(window, 'adjust', handle, true);
}
