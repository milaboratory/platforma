import { onBeforeUnmount, type Ref } from 'vue';
import { tap, tapIf } from '@/lib/helpers/functions';
import { onChanged } from '@/lib/composition/utils';
import { call } from '@/lib/helpers/utils';
import { onResizeElement, unobserve } from '@/lib/global/resizeObserver';

export function useLabelNotch(root: Ref<HTMLElement | undefined>, labelSelector = 'label') {
  const labels = new Set<Element>();

  onChanged(() => {
    tapIf(root?.value, (el) => {
      const label = el.querySelector(labelSelector);

      if (!label) {
        return;
      }

      labels.add(label);

      onResizeElement(label, () => {
        const rightOffset = call(() => {
          const offset = getComputedStyle(label).getPropertyValue('--label-offset-left-x');
          return label.getBoundingClientRect().width + tap(parseInt(offset, 10), (n) => (Number.isNaN(n) ? 8 : n));
        });

        el.style.setProperty('--label-offset-right-x', `${rightOffset}px`);
      });
    });
  });

  onBeforeUnmount(() => {
    Array.from(labels.values()).map((el) => unobserve(el));
  });
}
