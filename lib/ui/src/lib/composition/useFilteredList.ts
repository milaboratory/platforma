import type { ComputedRef, Ref } from 'vue';
import { computed } from 'vue';
import type { Option } from '@/lib/types';

export function useFilteredList(items: Option[], searchPhrase: Ref<string>): ComputedRef<Option[]> {
  return computed(() => {
    if (searchPhrase.value) {
      return items.filter((element) => element['text'].toLowerCase().includes(searchPhrase.value.toLowerCase()));
    }
    return items;
  });
}
