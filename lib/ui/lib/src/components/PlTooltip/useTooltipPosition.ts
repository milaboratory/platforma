import { type Ref, ref } from 'vue';
import { call } from '@/helpers/utils';
import { usePosition } from '@/composition/usePosition';

/**
 * A custom hook that calculates and returns the CSS style needed to position a tooltip
 * relative to a target HTML element based on the specified position and gap.
 *
 * @param el - A `Ref` object containing the target HTML element. The tooltip will be positioned relative to this element.
 * @param position - The preferred position of the tooltip relative to the target element.
 *                   Acceptable values are `'top-left'`, `'right'`, `'left'`, and `'top'`.
 *                   Defaults to `'right'`.
 * @param gap - The gap in pixels between the tooltip and the target element.
 *              Defaults to `8`.
 *
 * @returns A `Ref` object containing a string representing the CSS style that positions the tooltip.
 *
 * @throws Will throw an error if an unknown tooltip position is provided.
 */
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
