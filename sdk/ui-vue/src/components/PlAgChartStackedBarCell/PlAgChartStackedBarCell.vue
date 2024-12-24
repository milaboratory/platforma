<script setup lang="ts">
import type { ICellRendererParams } from 'ag-grid-enterprise';
import type {
  PlChartStackedBarSettings } from '@milaboratories/uikit';
import {
  PlChartStackedBarCompact,
} from '@milaboratories/uikit';
import { computed } from 'vue';

const props = defineProps<{
  params: ICellRendererParams<unknown, PlChartStackedBarSettings | undefined>;
}>();

const settings = computed(() => props.params.value || undefined);
</script>

<template>
  <div class="pl-ag-chart-stacked-bar-cell">
    <PlChartStackedBarCompact v-if="settings" :settings="settings" />
  </div>
</template>

<style>
.pl-ag-chart-stacked-bar-cell {
  height: 100%;
  display: flex;
  flex-direction: row;
  align-items: center;
}
</style>
