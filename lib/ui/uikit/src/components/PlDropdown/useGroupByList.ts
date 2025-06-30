import type { Ref } from 'vue';
import { computed } from 'vue';

export function groupByList<T, K extends keyof T>(
  list: T[],
  groupBy: K,
): {
    grouped: Map<K, T[]>;
    rest: T[];
    ordered: T[];
  } {
  const grouped: Map<K, T[]> = new Map();

  if (!list) {
    return {
      grouped,
      rest: [],
      ordered: [],
    };
  }

  // Group items by the specified key
  for (const item of list) {
    const key = item[groupBy] as string | number | symbol;
    if (key === undefined) continue;
    if (!grouped.has(key as K)) grouped.set(key as K, []);
    grouped.get(key as K)?.push(item);
  }

  // Items without a group key
  const rest = list.filter((item: T) => {
    const key = item[groupBy] as string | number | symbol;
    return key === undefined;
  });

  const ordered = [...Array.from(grouped.values()).flat(), ...rest];

  return {
    grouped,
    rest,
    ordered,
  };
}

export function useGroupByList<T, K extends keyof T>(
  list: Ref<T[]>,
  groupBy: K,
) {
  const result = computed(() => groupByList(list.value, groupBy));

  const orderedRef = computed(() => result.value.ordered);

  const groupsRef = computed(() => result.value.grouped);

  const restRef = computed(() => result.value.rest);

  return {
    orderedRef,
    groupsRef,
    restRef,
  };
}
