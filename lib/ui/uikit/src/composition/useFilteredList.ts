import type { ComputedRef, Ref } from 'vue';
import { computed } from 'vue';
import type { ListOption, ListOptionNormalized } from '../types';
import { normalizeListOptions } from '../helpers/utils';

export function useFilteredList<V = unknown>(optionsRef: Ref<ListOption<V>[]>, searchPhrase: Ref<string>): ComputedRef<ListOptionNormalized<V>[]> {
  return computed(() => {
    const options = normalizeListOptions(optionsRef.value);
    if (searchPhrase.value) {
      return options.filter((element) => {
        return element.label.toLowerCase().includes(searchPhrase.value.toLowerCase());
      });
    }
    return options;
  });
}
