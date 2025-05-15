<script lang="ts" setup>
import { computed, ref, watchEffect } from 'vue';
import { multiSequenceAlignment } from './multi-sequence-alignment';
import type { SequenceRow } from './types';

const { rows } = defineProps<{
  rows: SequenceRow[];
}>();

const alignedRows = ref<SequenceRow[]>([]);

watchEffect(async () => {
  alignedRows.value = await multiSequenceAlignment(rows);
});

const labelColumnsNum = computed(() => rows.at(0)?.labels.length);
</script>

<template>
  <div :class="['pl-scrollable', $style.container]">
    <template v-for="row of alignedRows" :key="row.sequence">
      <div
        v-for="(label, i) of row.labels"
        :key="i"
        :class="$style.label"
      >
        {{ label }}
      </div>
      <div>{{ row.sequence }}</div>
    </template>
  </div>
</template>

<style module>
.container {
  display: grid;
  grid-template-columns: repeat(v-bind(labelColumnsNum), auto) 1fr;
  font-family: monospace;
  gap: 8px 16px;
  text-wrap: nowrap;
}
.label {
  justify-self: end;
}
</style>
