<script setup lang="ts">
import { useCssModule } from 'vue';
import type { HighlightLegend } from './types';

const props = defineProps<{
  legend: HighlightLegend;
}>();

const classes = useCssModule();
</script>

<template>
  <div :class="classes.container">
    <div
      v-for="({ label, color }, key) of props.legend"
      :key="key"
      :class="classes.item"
    >
      <div :class="classes.colorSample" :style="{ backgroundColor: color }" />
      {{ label }}
    </div>
  </div>
</template>

<style module>
.container {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  max-inline-size: fit-content;
}

.item {
  display: flex;
  gap: 4px;
}

.colorSample {
  display: inline-block;
  block-size: 18px;
  inline-size: 18px;
  border-radius: 3px;
}
</style>
