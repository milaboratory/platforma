<script lang="ts" setup>
import { computed } from 'vue';
import type { PlChartStackedBarSettingsCompact } from './types';
import StackedRowCompact from './StackedRowCompact.vue';

const props = defineProps<{
  settings: PlChartStackedBarSettingsCompact;
}>();

const data = computed(() => {
  return props.settings.data ?? [];
});
</script>

<template>
  <div :class="$style.component">
    <StackedRowCompact :value="data"/>
  </div>
</template>

<style lang="scss" module>
.component {
  display: flex;
  flex-direction: column;
  width: 100%;
}
</style>
