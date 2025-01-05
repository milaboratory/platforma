<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue';
import { createHistogramFromBins, createHistogramLinear, createHistogramLog } from './histogram';
import type { ChartOptions, PlChartHistogramSettings } from './types';

const props = defineProps<{
  settings: PlChartHistogramSettings;
}>();

const chart = ref<HTMLElement>();

const options = computed<ChartOptions>(() => {
  const { xAxisLabel, yAxisLabel, threshold, compact, totalWidth = 674, totalHeight = 252 } = props.settings;

  const margin = compact ? { top: 0, right: 0, bottom: 0, left: 0 } : { top: 0, right: 30, bottom: 40, left: 85 };
  const width = totalWidth - margin.left - margin.right;
  const height = totalHeight - margin.top - margin.bottom;

  return {
    width,
    height,
    margin,
    compact,
    nBins: 'nBins' in props.settings ? props.settings.nBins : 10,
    xAxisLabel: xAxisLabel,
    yAxisLabel: yAxisLabel,
    threshold: threshold,
  };
});

const createHistogram = () => {
  const settings = props.settings;

  if (settings.type === 'log-bins') {
    createHistogramFromBins(chart.value!, options.value, settings.bins);
    return;
  }

  if (settings.log) {
    createHistogramLog(chart.value!, options.value, settings.numbers);
  } else {
    createHistogramLinear(chart.value!, options.value, settings.numbers);
  }
};

watch(props, createHistogram);

onMounted(createHistogram);
</script>

<template>
  <div :class="$style.component">
    <div v-if="settings.title && !settings.compact" :class="$style.title">{{ settings.title }}</div>
    <div ref="chart" />
  </div>
</template>

<style module>
.component {
  display: flex;
  flex-direction: column;
  gap: 24px;
  svg {
    font-family: var(--font-family-base);
  }
}

.title {
  font-size: 20px;
  font-weight: 500;
  line-height: 24px; /* 120% */
  letter-spacing: -0.2px;
}

:global(.svg-tooltip) {
    font-family: var(--font-family-base);
    background: rgba(69,77,93,.9);
    border-radius: .1rem;
    color: #fff;
    display: block;
    font-size: 14px;
    max-width: 320px;
    padding: .2rem .4rem;
    position: absolute;
    text-overflow: ellipsis;
    white-space: pre;
    z-index: 300;
    visibility: hidden;
}
</style>
