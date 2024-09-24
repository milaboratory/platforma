import { computed, type Ref, ref, unref } from 'vue';
import { useElementPosition } from '@/composition/usePosition';
import type { ElementPosition } from '@/types';

type Options = {
  position: 'top-left' | 'right' | 'left' | 'top';
  gap: number;
};

/**
 * A custom hook that calculates and returns the CSS style needed to position a tooltip
 * relative to a target HTML element based on the specified position and gap.
 */
export function useTooltipPosition(el: Ref<HTMLElement | undefined>, optionsRef: Ref<Options>) {
  const posRef = ref<ElementPosition>();

  useElementPosition(el, (v) => {
    posRef.value = v;
  });

  return computed(() => {
    const pos = unref(posRef);

    const options = unref(optionsRef);

    const position = options.position ?? 'top';

    const gap = options.gap ?? 8;

    if (!pos) {
      return '';
    }

    const offsetMiddleY = pos.offsetY + Math.floor(pos.height / 2);
    const offsetMiddleX = pos.offsetX + Math.floor(pos.width / 2);
    if (position === 'top-left') {
      return `left: ${pos.offsetX}px; top: ${pos.offsetY - gap}px;`;
    }

    if (position === 'top') {
      return `left: ${offsetMiddleX}px; top: ${pos.offsetY - gap}px;`;
    }

    if (position === 'right') {
      return `left: ${pos.offsetX + pos.width + gap}px; top: ${offsetMiddleY}px;`;
    }

    if (position === 'left') {
      return `right: ${pos.scrollWidth - pos.x + gap}px; top: ${offsetMiddleY}px;`;
    }

    return '';
  });
}
