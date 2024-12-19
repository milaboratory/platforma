<script lang="ts" setup>
import { computed } from 'vue';
import StackedRow from './StackedRow.vue';
import Legends from './Legends.vue';
import type { PlChartStackedBarSettings } from './types';

const props = defineProps<{
  settings: PlChartStackedBarSettings;
}>();

const showLegends = computed(() => props.settings.showLegends ?? true);

const data = computed(() => {
  return props.settings.data ?? [];
});

const legends = computed(() => data.value.map((p) => ({
  color: p.color,
  text: p.label,
})));
</script>

<template>
  <div :class="$style.component">
    <div v-if="settings.title" :class="$style.title">{{ settings.title }}</div>
    <StackedRow :value="data"/>
    <Legends v-if="showLegends && legends.length" :legends="legends" :max-in-column="settings.maxLegendsInColumn" />
  </div>
</template>

<style lang="scss" module>
.component {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.title {
  font-size: 20px;
  font-weight: 500;
  line-height: 24px; /* 120% */
  letter-spacing: -0.2px;
  margin-bottom: 24px;
}
</style>
