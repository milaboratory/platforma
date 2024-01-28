import type { Ref } from 'vue';
import { tap, tapIf } from '@/lib/helpers/functions';
import { onChanged } from '@/lib/composition/utils';
import { call } from '@/lib/helpers/utils';
import { onResizeElement } from '@/lib/global/resizeObserver';

export function useLabelNotch(root: Ref<HTMLElement | undefined>, labelSelector = 'label') {
  onChanged(() => {
    tapIf(root?.value, (el) => {
      const label = el.querySelector(labelSelector);

      if (!label) {
        return;
      }

      onResizeElement(label, () => {
        const rightOffset = call(() => {
          const offset = getComputedStyle(label).getPropertyValue('--label-offset-left-x');
          return label.getBoundingClientRect().width + tap(parseInt(offset, 10), (n) => (Number.isNaN(n) ? 8 : n));
        });

        el.style.setProperty('--label-offset-right-x', `${rightOffset}px`);
      });
    });
  });
}
