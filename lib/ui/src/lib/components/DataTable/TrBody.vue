<script lang="ts" setup>
import type { TableRow } from './types';

defineProps<{
  row: TableRow;
}>();
</script>

<template>
  <div class="tr-body" :style="row.style" :class="{ selected: row.selected }">
    <slot />
  </div>
</template>
