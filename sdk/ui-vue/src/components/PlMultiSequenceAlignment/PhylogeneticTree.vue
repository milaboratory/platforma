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
import { cellSize } from './cell-size';
import type { TreeNodeData } from './phylogenetic-tree.worker';
import { useMiPlots } from './useMiPlots';

const { tree } = defineProps<{
  tree: TreeNodeData[];
}>();

const plotEl = useTemplateRef('plotEl');

const settings = computed<Settings | undefined>(() => {
  return ({
    type: 'dendro',
    title: { show: false, name: '' },
    size: {
      width: 150,
      minCellHeight: cellSize.block,
      maxCellHeight: cellSize.block,
    },
    mode: 'normal',
    leavesMode: 'alignLeavesToLine',
    legend: { show: false },
    id: {
      type: 'column',
      value: 'nodeId',
    },
    parentId: {
      type: 'column',
      value: 'parentId',
    },
    height: {
      type: 'column',
      value: 'distance',
    },
    // showNodes: false,
    // showNodesLabels: false,
    // showLeavesLabels: false,
    rootPosition: 'left',
  });
});

const data = computed<DataByColumns>(
  () => {
    const nodeId: number[] = [];
    const parentId: (number | null)[] = [];
    const distance: number[] = [];
    for (const node of tree) {
      nodeId.push(node.id);
      parentId.push(node.parentId ?? null);
      distance.push(node.length ?? 0);
    }
    console.log({ nodeId, parentId, distance });
    return ({
      type: 'columns',
      id: `phylogeneticTree-${crypto.randomUUID()}`,
      values: { nodeId, parentId, distance },
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
