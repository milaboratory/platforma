<script lang="ts" setup>
import type {
  ChartInterface,
  DataByColumns,
  Settings,
} from '@milaboratories/miplots4';
import { PlAlert } from '@milaboratories/uikit';
import {
  computed,
  onBeforeUnmount,
  shallowRef,
  useTemplateRef,
  watchEffect,
} from 'vue';
import type { ResidueCounts } from './types';
import { useMiPlots } from './useMiPlots';

const { residueCounts } = defineProps<{
  residueCounts: ResidueCounts;
}>();

const plotEl = useTemplateRef('plotEl');

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
  const width = residueCounts.length * 20;
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
          width: (width - residueCounts.length + 1) / residueCounts.length,
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
      width,
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
        countKey.push(residue === ' ' ? 0 : count);
        columnKey.push(columnIndex);
      }
    }
    return ({
      type: 'columns',
      id: `consensus-${crypto.randomUUID()}`,
      values: { countKey, columnKey },
    });
  },
);

const plot = shallowRef<ChartInterface>();

const { miplots, error } = useMiPlots();

watchEffect(async () => {
  if (!settings.value || !plotEl.value || !miplots.value) return;
  if (!plot.value) {
    plot.value = miplots.value.newPlot(data.value, settings.value);
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
  <PlAlert v-if="error" type="error">
    {{ error.message }}
  </PlAlert>
  <div v-else :class="$style.container">
    <div :class="$style.labels">
      {{ columns.map(column => column.label).join('') }}
    </div>
    <div ref="plotEl" />
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
  line-height: 24px;
  letter-spacing: 11.6px;
  text-indent: 5.8px;
  margin-inline-end: -5.8px;
}
</style>
