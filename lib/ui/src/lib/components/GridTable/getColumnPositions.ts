import {unref, Ref} from 'vue';
import {utils} from '@milaboratory/helpers';

type MaybeRef<T> = T | Ref<T>;

export function getColumnPositions(tableRef: MaybeRef<HTMLElement | undefined>) {
  const ths = utils.tapIf(unref(tableRef)?.querySelectorAll('.th-cell'), l => [...l]) ?? [];
  return ths.map((th, index) => {
    const {width, x} = th.getBoundingClientRect();
    return {
      index,
      width,
      x,
      right: x + width
    };
  }).slice(0, ths.length - 1);
}
