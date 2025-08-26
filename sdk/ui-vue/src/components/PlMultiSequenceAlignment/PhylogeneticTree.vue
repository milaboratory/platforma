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
  useCssModule,
  useTemplateRef,
  watchEffect,
} from 'vue';
import { cellSize } from './cell-size';
import type { TreeNodeData } from './phylogenetic-tree.worker';
import { useMiPlots } from './useMiPlots';

const props = defineProps<{
  tree: TreeNodeData[];
}>();

const classes = useCssModule();

const plotEl = useTemplateRef('plotEl');

const settings: Settings = {
  type: 'dendro',
  title: { show: false, name: '' },
  size: {
    width: 149,
    minCellHeight: cellSize.block,
    maxCellHeight: cellSize.block,
    marginLeft: 1,
    marginRight: 0,
    marginTop: 0,
    marginBottom: 0,
  },
  mode: 'normal',
  leavesMode: 'alignLeavesToLine',
  leavesOrder: 'indexAsc',
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
  showNodes: false,
  showNodesLabels: false,
  showLeavesLabels: false,
  rootPosition: 'left',
};

const data = computed<DataByColumns>(() => {
  const nodeId: number[] = [];
  const parentId: (number | null)[] = [];
  const distance: number[] = [];
  for (const node of props.tree) {
    nodeId.push(node.id);
    parentId.push(node.parentId ?? null);
    distance.push(node.length ?? 0);
  }
  return ({
    type: 'columns',
    id: `phylogeneticTree-${crypto.randomUUID()}`,
    values: { nodeId, parentId, distance },
  });
});

const { miplots, error } = useMiPlots();

const plot = shallowRef<ChartInterface>();

watchEffect(async () => {
  if (!plotEl.value || !miplots.value) return;
  if (!plot.value) {
    plot.value = miplots.value.newPlot(data.value, settings);
    plot.value.mount(plotEl.value);
  } else {
    plot.value.updateSettingsAndData(data.value, settings);
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
  <div v-else ref="plotEl" :class="classes.container" />
</template>

<style module>
.container {
  svg {
    display: block;
  }
}
</style>
