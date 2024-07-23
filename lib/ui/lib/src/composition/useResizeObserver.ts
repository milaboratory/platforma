import { onUnmounted, unref } from 'vue';
import { tapIf } from '@/helpers/functions';
import { onChanged } from '@/composition/utils';
import { onResizeElement, unobserve } from '@/global/resizeObserver';
import type { MaybeRef } from '@/types';

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
