<script setup lang="ts" generic="T, K extends keyof T">
import { computed, defineProps, toRef } from 'vue';

const props = defineProps<{
  list: T[];
  groupBy: K;
}>();

const list = toRef(props, 'list');
const groupBy = toRef(props, 'groupBy');

const grouped = computed<Map<K, T[]>>(() => {
  const result: Map<K, T[]> = new Map();
  if (!list.value) return result;
  for (const item of list.value) {
    const key = item[groupBy.value as keyof T] as string | number | symbol;
    if (key === undefined) continue;
    if (!result.has(key as K)) result.set(key as K, []);
    result.get(key as K)?.push(item);
  }
  return result;
});

// Items without a group key
const rest = computed<T[]>(() => {
  if (!list.value) return [];
  return list.value.filter((item: T) => {
    const key = item[groupBy.value as keyof T] as string | number | symbol;
    return key === undefined;
  });
});

const hasGroups = computed(() => grouped.value.size > 0);
</script>

<template>
  <slot :groups="grouped" :rest="rest" :has-groups="hasGroups" />
</template>
