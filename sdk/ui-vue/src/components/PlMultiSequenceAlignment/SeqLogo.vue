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
  return ({
    type: 'discrete',
    title: {
      name: '',
      show: false,
    },
    size: {
      width: residueCounts.length * 20,
      height: 80,
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
      id: `seq-logo-${crypto.randomUUID()}`,
      values: { countKey, columnKey, residueKey },
    });
  },
);

const { miplots, error } = useMiPlots();

const plot = shallowRef<ChartInterface>();

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
  <div v-else ref="plotEl" />
</template>
