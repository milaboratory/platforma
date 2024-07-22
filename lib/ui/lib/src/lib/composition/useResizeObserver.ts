import { onUnmounted, unref } from 'vue';
import { tapIf } from '@/lib/helpers/functions';
import { onChanged } from '@/lib/composition/utils';
import { onResizeElement, unobserve } from '@/lib/global/resizeObserver';
import type { MaybeRef } from '@/lib/types';

export function useResizeObserver<T extends HTMLElement>(target: MaybeRef<T | undefined>, cb: (el?: T | undefined) => void) {
  onChanged(() => {
    tapIf(unref(target), (el) => {
      onResizeElement(el, () => cb(el));
    });
  });

  onUnmounted(() => {
    tapIf(unref(target), (el) => {
      unobserve(el);
    });
  });
}
