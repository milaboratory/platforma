<script setup lang="ts">
import type { HighlightLegend } from './types';

defineProps<{
  legend: HighlightLegend;
}>();
</script>

<template>
  <div :class="$style.container">
    <div
      v-for="([key, { label, color }]) of Object.entries(legend)"
      :key="key"
      :class="$style.item"
    >
      <div
        :class="$style['color-sample']"
        :style="{ backgroundColor: color }"
      />
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

.color-sample {
  display: inline-block;
  block-size: 18px;
  inline-size: 18px;
  border-radius: 3px;
}
</style>
