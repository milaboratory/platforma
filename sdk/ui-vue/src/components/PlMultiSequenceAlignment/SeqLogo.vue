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

const { residueFrequencies } = defineProps<{
  residueFrequencies: Record<string, number>[];
}>();

const container = useTemplateRef('container');

const size = ref<{ width: number; height: number }>();

useResizeObserver(container, ([{ contentRect: { width, height } }]) => {
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

const settings = computed<Settings | undefined>(() => {
  if (!size.value) return;
  return (
    {
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
        value: 'frequencyKey',
      },
      primaryGrouping: {
        columnName: {
          type: 'column',
          value: 'columnKey',
        },
        order: residueFrequencies.map((_, i) => i),
      },
      secondaryGrouping: {
        columnName: {
          type: 'column',
          value: 'residueKey',
        },
      },
      layers: [{
        type: 'logo',
        aes: {
          fillColor: {
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
          },
        },
      }],
    }
  );
});

const data = computed<DataByColumns>(
  () => {
    const frequencyKey: number[] = [];
    const columnKey: number[] = [];
    const residueKey: string[] = [];
    for (const [columnIndex, column] of residueFrequencies.entries()) {
      for (const [residue, frequency] of Object.entries(column)) {
        frequencyKey.push(frequency);
        columnKey.push(columnIndex);
        residueKey.push(residue);
      }
    }
    return ({
      type: 'columns',
      id: 'seq-logo',
      values: { frequencyKey, columnKey, residueKey },
    });
  },
);

const plot = shallowRef<ChartInterface>();

watchEffect(() => {
  if (!settings.value || !container.value) return;
  if (!plot.value) {
    plot.value = MiPlots.newPlot(data.value, settings.value);
    plot.value.mount(container.value);
  } else {
    plot.value.updateSettingsAndData(data.value, settings.value);
  }
});

onBeforeUnmount(() => {
  plot.value?.unmount();
});
</script>

<template>
  <div ref="container" />
</template>
