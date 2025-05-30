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

const palette = {
  blue: '#549EE7',
  red: '#E85456',
  green: '#65BF65',
  magenta: '#9178E1',
  pink: '#D568D5',
  orange: '#C59445',
  cyan: '#62C7CC',
  yellow: '#D5D549',
  black: '#000000',
};

const residueColors = {
  A: palette.blue,
  R: palette.red,
  N: palette.green,
  D: palette.magenta,
  C: palette.pink,
  Q: palette.green,
  E: palette.magenta,
  G: palette.orange,
  H: palette.cyan,
  I: palette.blue,
  L: palette.blue,
  K: palette.red,
  M: palette.blue,
  F: palette.blue,
  P: palette.yellow,
  S: palette.green,
  T: palette.green,
  W: palette.blue,
  Y: palette.cyan,
  V: palette.blue,
  B: palette.black,
  X: palette.black,
  Z: palette.black,
};

const settings = computed<Settings | undefined>(() => {
  if (!size.value) return;
  return ({
    type: 'discrete',
    title: {
      name: '',
      show: false,
    },
    size: {
      width: size.value.width,
      height: size.value.height,
      innerOffset: 0,
      outerOffset: 0,
    },
    frame: {
      type: 'empty',
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
    y: {
      type: 'column',
      value: 'countKey',
    },
    primaryGrouping: {
      columnName: {
        type: 'column',
        value: 'columnKey',
      },
    },
    secondaryGrouping: {
      columnName: {
        type: 'column',
        value: 'residueKey',
      },
    },
    layers: [{
      type: 'logo',
      aes: { fillColor: residueColors },
    }],
  });
});

const data = computed<DataByColumns>(
  () => {
    const countKey: number[] = [];
    const columnKey: number[] = [];
    const residueKey: string[] = [];
    for (const [columnIndex, column] of residueCounts.entries()) {
      for (const [residue, count] of Object.entries(column)) {
        if (residue === '-') continue;
        countKey.push(count);
        columnKey.push(columnIndex);
        residueKey.push(residue);
      }
    }
    return ({
      type: 'columns',
      id: 'seq-logo',
      values: { countKey, columnKey, residueKey },
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
    <div ref="plotEl" :class="$style.plot" />
  </div>
</template>

<style module>
.container {
  position: relative;
  block-size: 80px;
}

.plot {
  position: absolute;
  inset: 0;
}
</style>
