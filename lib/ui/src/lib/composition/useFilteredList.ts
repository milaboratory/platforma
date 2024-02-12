import type { ComputedRef, Ref } from 'vue';
import { computed } from 'vue';

export function useFilteredList<T extends Record<string, string>>(items: T[], searchPhrase: Ref<string>, itemKey: string): ComputedRef<T[]> {
  return computed(() => {
    if (searchPhrase.value) {
      return items.filter((element) => element[itemKey].toLowerCase().includes(searchPhrase.value.toLowerCase()));
    }
    return items;
  });
}
