import { isRef, isShallow } from 'vue';
import { shallowClone } from '@milaboratories/helpers';

export const moveElements = <T>(array: T[], from: number, to: number): T[] => {
  if (to >= 0 && to < array.length) {
    const element = array.splice(from, 1)[0];
    array.splice(to, 0, element);
  }

  return array;
};

export function optionalUpdateRef<T>(ref: T) {
  if (isRef(ref) && isShallow(ref)) {
    ref.value = shallowClone(ref.value);
  }
}
