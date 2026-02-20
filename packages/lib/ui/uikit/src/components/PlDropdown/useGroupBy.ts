import type { Ref } from "vue";
import { computed } from "vue";

function groupBy<T, K extends keyof T>(
  list: T[],
  groupBy: K,
): {
  grouped: Map<NonNullable<T[K]>, T[]>;
  rest: T[];
  ordered: T[];
} {
  const grouped: Map<NonNullable<T[K]>, T[]> = new Map();

  if (!list) {
    return {
      grouped,
      rest: [],
      ordered: [],
    };
  }

  // Group items by the specified key
  for (const item of list) {
    const key = item[groupBy];
    if (key === undefined) continue;
    if (key === null) continue;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)?.push(item);
  }

  // Items without a group key
  const rest = list.filter((item: T) => {
    const key = item[groupBy];
    return key === undefined || key === null;
  });

  const ordered = [...Array.from(grouped.values()).flat(), ...rest];

  return {
    grouped,
    rest,
    ordered,
  };
}

export function useGroupBy<T, K extends keyof T>(list: Ref<T[]>, byKey: K) {
  const result = computed(() => groupBy(list.value, byKey));

  const orderedRef = computed(() => result.value.ordered);

  const groupsRef = computed(() => result.value.grouped);

  const restRef = computed(() => result.value.rest);

  return {
    orderedRef,
    groupsRef,
    restRef,
  };
}
