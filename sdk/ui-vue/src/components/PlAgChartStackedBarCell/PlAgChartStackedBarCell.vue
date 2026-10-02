<script setup lang="ts">
import type { ICellRendererParams } from "ag-grid-enterprise";
import type { PlChartStackedBarSettings } from "@milaboratories/uikit";
import { PlChartStackedBarCompact } from "@milaboratories/uikit";
import { computed } from "vue";

const props = defineProps<{
  params: ICellRendererParams<unknown, PlChartStackedBarSettings | undefined>;
}>();

const settings = computed(() => props.params.value || undefined);
</script>

<template>
  <div data-testid="pl-ag-chart-stacked-bar-cell" class="pl-ag-chart-stacked-bar-cell">
    <PlChartStackedBarCompact
      v-if="settings"
      data-testid="pl-ag-chart-stacked-bar-cell-chart"
      :settings="settings"
    />
    <div
      v-else
      data-testid="pl-ag-chart-stacked-bar-cell-not-ready"
      class="pl-ag-chart-stacked-bar-cell__not-ready"
    >
      Not ready
    </div>
  </div>
</template>

<style>
.pl-ag-chart-stacked-bar-cell {
  height: 100%;
  display: flex;
  flex-direction: row;
  align-items: center;
}

.pl-ag-chart-stacked-bar-cell__not-ready {
  color: var(--txt-03) !important;
}
</style>
