<script setup lang="ts">
import type { ColorMap } from './types';

defineProps<{
  colors: ColorMap;
}>();
</script>

<template>
  <div :class="$style.container">
    <div
      v-for="([key, { label, color }]) in Object.entries(colors)"
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
