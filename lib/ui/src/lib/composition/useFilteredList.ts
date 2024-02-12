
import type { ComputedRef, Ref } from "vue";
import { computed } from "vue";

export function useFilteredList<T extends Array<any>>(items: T, searchPhrase: Ref<string>, itemKey: string): ComputedRef<any[]> {
    return computed(() => {
        if (searchPhrase.value) {
            return items.filter((element) => (element[itemKey] as string).toLowerCase().includes(searchPhrase.value.toLowerCase()));
        }
        return items;
    });
}