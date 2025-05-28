<script lang="ts" setup>
import {
  type ChartInterface,
  type DataByColumns,
  MiPlots,
  type Settings,
} from '@milaboratories/miplots4';
import { useResizeObserver } from '@vueuse/core';
import {
  computed,
  onBeforeUnmount,
  ref,
  shallowRef,
  useTemplateRef,
  watchEffect,
} from 'vue';
import type { ResidueCounts } from './types';

const { residueCounts } = defineProps<{
  residueCounts: ResidueCounts;
}>();

const plotEl = useTemplateRef('plotEl');

const size = ref<{ width: number; height: number }>();

useResizeObserver(plotEl, ([{ contentRect: { width, height } }]) => {
  size.value = { width, height };
});

const columns = computed(() => {
  return residueCounts.map((column) => {
    let totalCount = 0;
    let topResidue = { label: '', count: 0 };
    for (const [residue, count] of Object.entries(column)) {
      totalCount += count;
      if (residue === '-') continue;
      if (count > topResidue.count) topResidue = { label: residue, count };
    }
    const confidence = CSS.percent(topResidue.count / totalCount * 100);
    return {
      label: topResidue.label,
      color: `color-mix(in oklab, ${confidence} #3056AE, #C1CDE9)`,
    };
  });
});

const settings = computed<Settings | undefined>(() => {
  if (!size.value) return;
  return ({
    type: 'discrete',
    y: {
      type: 'column',
      value: 'countKey',
    },
    legend: { show: false },
    primaryGrouping: {
      columnName: {
        type: 'column',
        value: 'columnKey',
      },
      order: residueCounts.map((_, i) => i),
      inheritedAes: Object.fromEntries(
        columns.value.map(({ color }) => ({ fillColor: color })).entries(),
      ),
    },
    layers: [{
      type: 'bar',
      height: 'max',
      aes: {
        ...residueCounts.length && {
          width: (size.value.width - residueCounts.length + 1)
            / residueCounts.length,
        },
        fillColor: {
          type: 'primaryGrouping',
        },
        lineColor: '#ffffff',
      },
    }],
    title: {
      name: '',
      show: false,
    },
    size: {
      width: size.value.width,
      height: 60,
      outerOffset: 0,
      innerOffset: 0,
    },
    xAxis: {
      title: '',
      showGrid: false,
      showTicks: false,
      hiddenLabels: true,
    },
    yAxis: {
      title: '',
      showGrid: false,
      showTicks: false,
      hiddenLabels: true,
    },
    frame: {
      type: 'empty',
    },
  });
});

const data = computed<DataByColumns>(
  () => {
    const countKey: number[] = [];
    const columnKey: number[] = [];
    for (const [columnIndex, column] of residueCounts.entries()) {
      for (const [residue, count] of Object.entries(column)) {
        if (residue === '-') continue;
        countKey.push(count);
        columnKey.push(columnIndex);
      }
    }
    return ({
      type: 'columns',
      id: 'consensus',
      values: { countKey, columnKey },
    });
  },
);

const plot = shallowRef<ChartInterface>();

watchEffect(() => {
  if (!settings.value || !plotEl.value) return;
  if (!plot.value) {
    plot.value = MiPlots.newPlot(data.value, settings.value);
    plot.value.mount(plotEl.value);
  } else {
    plot.value.updateSettingsAndData(data.value, settings.value);
  }
});

onBeforeUnmount(() => {
  plot.value?.unmount();
});
</script>

<template>
  <div :class="$style.container">
    <div :class="$style.labels">
      {{ columns.map(column => column.label).join('') }}
    </div>
    <div :class="$style['plot-container']">
      <div ref="plotEl" :class="$style.plot" />
    </div>
  </div>
</template>

<style module>
.container {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.labels {
  font-family: Spline Sans Mono;
  font-weight: 600;
  line-height: calc(24 / 14);
  letter-spacing: 12px;
  text-indent: 6px;
  margin-inline-end: -6px;
}

.plot-container {
  position: relative;
  block-size: 60px;
}

.plot {
  position: absolute;
  inset: 0;
}
</style>
