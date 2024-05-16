import type { ComputedRef, Ref } from 'vue';
import { computed } from 'vue';
import type { Option } from '@/lib/types';

export function useFilteredList(items: Ref<Option[]>, searchPhrase: Ref<string>): ComputedRef<Option[]> {
  return computed(() => {
    if (searchPhrase.value) {
      return items.value.filter((element) => {
        if (typeof element['text'] === 'object') {
          return element['text']['title'].toLowerCase().includes(searchPhrase.value.toLowerCase());
        } else {
          return element['text'].toLowerCase().includes(searchPhrase.value.toLowerCase());
        }
      });
    }
    return items.value;
  });
}
