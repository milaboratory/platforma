import { type Ref, ref } from 'vue';
import { call } from '@/lib/helpers/utils';
import { usePosition } from '@/lib/composition/usePosition';

export function useTooltipPosition(el: Ref<HTMLElement | undefined>, position: 'top-left' | 'right' | 'left' | 'top' = 'right', gap = 8) {
  const style = ref('');

  usePosition(el, (pos) => {
    const offsetMiddleY = pos.offsetY + Math.floor(pos.height / 2);
    const offsetMiddleX = pos.offsetX + Math.floor(pos.width / 2);
    style.value = call(() => {
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

      throw Error('Unknown tooltip position');
    });
  });

  return style;
}
