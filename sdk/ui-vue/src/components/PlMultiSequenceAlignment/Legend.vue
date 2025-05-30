<script setup lang="ts">
import {
  chemicalCategories,
  chemicalPropertiesColors,
  chemicalPropertiesLabels,
} from './highlight/chemical-properties';
</script>

<template>
  <div :class="$style.container">
    <div
      v-for="category in chemicalCategories"
      :key="category"
      :class="$style.item"
    >
      <div
        :class="$style['color-sample']"
        :style="{ backgroundColor: chemicalPropertiesColors[category] }"
      />
      {{ chemicalPropertiesLabels[category] }}
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
