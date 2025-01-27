<script setup lang="ts">
import type { ICellRendererParams } from 'ag-grid-enterprise';
import {
  type InferComponentProps,
  PlChartHistogram,
} from '@milaboratories/uikit';
import { computed, ref } from 'vue';
import { useElementBounding } from '@vueuse/core';

type PlChartHistogramSettings = InferComponentProps<typeof PlChartHistogram>['settings'];

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
  <div ref="root" class="pl-ag-chart-histogram-cell">
    <PlChartHistogram v-if="settings" :settings="settings" />
    <div v-else class="pl-ag-chart-histogram-cell__not-ready ">Not ready</div>
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
