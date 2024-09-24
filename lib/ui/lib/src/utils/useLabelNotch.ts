import { onBeforeUnmount, type Ref } from 'vue';
import { tap, tapIf } from '@/helpers/functions';
import { onChanged } from '@/composition/utils';
import { call } from '@/helpers/utils';
import { startResizeObserving, stopResizeObserving } from '@/global/resizeObserver';

const offset = 8; // see --label-offset-left-x css var

const contourOffset = 4; // see --contour-offset css var

/**
 * Adjust the width of the cutout on the clip path for the notched label (TextField, Dropdown)
 */
export function useLabelNotch(root: Ref<HTMLElement | undefined>, labelSelector = 'label') {
  const labels = new Set<Element>();

  onChanged(() => {
    tapIf(root?.value, (el) => {
      const label = el.querySelector(labelSelector);

      if (!label) {
        return;
      }

      labels.add(label);

      startResizeObserving(label, () => {
        const rightOffset = call(() => {
          return label.getBoundingClientRect().width + tap(offset, (n) => (Number.isNaN(n) ? contourOffset : n + contourOffset)); //
        });

        if (el.style.getPropertyValue('--label-offset-right-x') !== `${rightOffset}px`) {
          el.style.setProperty('--label-offset-right-x', `${rightOffset}px`);
        }
      });
    });
  });

  onBeforeUnmount(() => {
    Array.from(labels.values()).map((el) => stopResizeObserving(el));
  });
}
