<script lang="ts" setup>
import { ref, nextTick } from 'vue';
import type { TableRow } from './types';
import { tapIf } from '@milaboratories/helpers';

defineProps<{
  row: TableRow;
}>();

const trRef = ref<HTMLElement>();

// hook to prevent weird left scroll after child repaint (@TODO)
const onScroll = () => {
  nextTick().then(() => {
    tapIf(trRef.value, (el) => (el.scrollLeft = 0));
  });
};
</script>

<template>
  <div ref="trRef" class="tr-body" scroll="no" :style="row.style" :class="{ selected: row.selected }" @scroll="onScroll">
    <slot />
  </div>
</template>
