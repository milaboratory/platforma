<script lang="ts" setup>
import { computed } from 'vue';
import type { ColumnSpec } from './types';
import { injectState } from './keys';

const state = injectState();

const props = defineProps<{
  column: ColumnSpec;
}>();

const selected = computed(() => state.data.selectedColumns.has(props.column.id));
</script>

<template>
  <div class="column-caret" :class="{ selected, frozen: column.frozen }" />
</template>
