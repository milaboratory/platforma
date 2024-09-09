import type { ComputedRef, Ref } from 'vue';
import { computed } from 'vue';
import type { ListOption } from '@/types';

export function useFilteredList(items: Ref<ListOption[]>, searchPhrase: Ref<string>): ComputedRef<ListOption[]> {
  return computed(() => {
    if (searchPhrase.value) {
      return items.value.filter((element) => {
        return element['text'].toLowerCase().includes(searchPhrase.value.toLowerCase());
      });
    }
    return items.value;
  });
}
