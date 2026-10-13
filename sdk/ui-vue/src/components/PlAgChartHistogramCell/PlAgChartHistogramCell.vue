<script setup lang="ts">
import type { ICellRendererParams } from "ag-grid-enterprise";
import { type InferComponentProps, PlChartHistogram } from "@milaboratories/uikit";
import { computed, ref } from "vue";
import { useElementBounding } from "@vueuse/core";

type PlChartHistogramSettings = InferComponentProps<typeof PlChartHistogram>["settings"];

const props = defineProps<{
  params: ICellRendererParams<unknown, PlChartHistogramSettings | undefined>;
}>();

const root = ref<HTMLElement>();

const { width } = useElementBounding(root);

const settings = computed<PlChartHistogramSettings | undefined>(() => {
  if (!props.params.value) {
    return undefined;
  }

  if (!width.value) {
    return undefined;
  }

  return { ...props.params.value, compact: true, totalHeight: 24, totalWidth: width.value };
});
</script>

<template>
  <div ref="root" data-testid="pl-ag-chart-histogram-cell" class="pl-ag-chart-histogram-cell">
    <PlChartHistogram
      v-if="settings"
      data-testid="pl-ag-chart-histogram-cell-chart"
      :settings="settings"
    />
    <div
      v-else
      data-testid="pl-ag-chart-histogram-cell-not-ready"
      class="pl-ag-chart-histogram-cell__not-ready"
    >
      Not ready
    </div>
  </div>
</template>

<style>
.pl-ag-chart-histogram-cell {
  height: 100%;
  display: flex;
  flex-direction: row;
  align-items: center;
}

.pl-ag-chart-histogram-cell__not-ready {
  color: var(--txt-03) !important;
}
</style>
