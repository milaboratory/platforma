<script lang="ts" setup>
import { MiPlots, type Settings } from '@milaboratories/miplots4';
import {
  computed,
  onBeforeUnmount,
  onWatcherCleanup,
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

function updateWidth(entries: ResizeObserverEntry[]) {
  const entry = entries.find((entry) => entry.target === container.value);
  if (!entry) return;
  const { width, height } = entry.contentRect;
  size.value = { width, height };
}

const resizeObserver = new ResizeObserver(updateWidth);

watchEffect(() => {
  const containerEl = container.value;
  if (!containerEl) return;
  resizeObserver.observe(containerEl);
  onWatcherCleanup(() => {
    resizeObserver.unobserve(containerEl);
  });
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

const settings = computed(() => {
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
        value: 'yColumnKey',
      },
      primaryGrouping: {
        columnName: {
          type: 'column',
          value: 'positionKey',
        },
        order: residueFrequencies.map((_, i) => i),
      },
      secondaryGrouping: {
        columnName: {
          type: 'column',
          value: 'letterKey',
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
    } satisfies Settings
  );
});

const data = computed(() => {
  const yColumnKey: number[] = [];
  const positionKey: number[] = [];
  const letterKey: string[] = [];
  for (const [columnIndex, column] of residueFrequencies.entries()) {
    for (const [residue, frequency] of Object.entries(column)) {
      yColumnKey.push(frequency);
      positionKey.push(columnIndex);
      letterKey.push(residue);
    }
  }
  return ({
    type: 'columns' as const,
    id: 'test',
    values: { yColumnKey, positionKey, letterKey },
  });
});

const plot = shallowRef<MiPlots>();

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
