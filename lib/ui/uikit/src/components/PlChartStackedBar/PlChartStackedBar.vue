<script lang="ts" setup>
import { computed } from 'vue';
import StackedRow from './StackedRow.vue';
import LegendComponent from './LegendComponent.vue';
import type { PlChartStackedBarSettings } from './types';

const props = defineProps<{
  settings: PlChartStackedBarSettings;
}>();

const size = 'large';

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
    <StackedRow :size="size" :value="data"/>
    <LegendComponent v-if="size === 'large' && legends.length" :legends="legends" :max-in-column="settings.maxLegendsInColumn" />
  </div>
</template>

<style lang="scss" module>
.component {
  display: flex;
  flex-direction: column;
  width: 100%;
}
</style>
