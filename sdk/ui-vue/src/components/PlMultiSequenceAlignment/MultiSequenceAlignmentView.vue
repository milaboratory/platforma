<script lang="ts" setup>
import {
  computed,
  onBeforeMount,
  onBeforeUnmount,
  onWatcherCleanup,
  ref,
  useTemplateRef,
  watch,
} from 'vue';
import { cellSize } from './cell-size';
import Consensus from './Consensus.vue';
import Legend from './Legend.vue';
import type { TreeNodeData } from './phylogenetic-tree.worker';
import PhylogeneticTree from './PhylogeneticTree.vue';
import SeqLogo from './SeqLogo.vue';
import type { HighlightLegend, ResidueCounts } from './types';

const { sequences } = defineProps<{
  sequences: {
    name: string;
    rows: string[];
    residueCounts: ResidueCounts;
    highlightImageUrl?: string;
  }[];
  labels: string[][];
  highlightLegend: HighlightLegend | undefined;
  phylogeneticTree: TreeNodeData[] | undefined;
  widgets: ('consensus' | 'seqLogo' | 'tree' | 'legend')[];
}>();

const rootEl = useTemplateRef('rootRef');
defineExpose({ rootEl });

const rowCount = computed(() => sequences.at(0)?.rows.length ?? 0);

const targetCellInlineSize = CSS.px(cellSize.inline).toString();
const targetCellBlockSize = CSS.px(cellSize.block).toString();

const referenceCellRef = useTemplateRef('referenceCell');
const referenceCellInlineSize = ref<number>();

const cornerRef = useTemplateRef('corner');
const cornerInlineSize = ref<number>();

const letterSpacing = computed(() =>
  referenceCellInlineSize.value
    ? CSS.px(cellSize.inline - referenceCellInlineSize.value).toString()
    : undefined,
);

const sequenceNameInsetInlineStart = computed(() =>
  CSS.px(cornerInlineSize.value ?? 0).toString(),
);

let observer: ResizeObserver;

onBeforeMount(() => {
  const getInlineSize = (entry: ResizeObserverEntry) =>
    entry.borderBoxSize.find(Boolean)?.inlineSize;

  observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      switch (entry.target) {
        case referenceCellRef.value:
          referenceCellInlineSize.value = getInlineSize(entry);
          break;
        case cornerRef.value:
          cornerInlineSize.value = getInlineSize(entry);
          break;
      }
    }
  });
});

onBeforeUnmount(() => {
  observer.disconnect();
});

for (const ref of [referenceCellRef, cornerRef]) {
  watch(ref, (el, prevEl) => {
    if (el) observer.observe(el);
    onWatcherCleanup(() => {
      if (prevEl) observer.unobserve(prevEl);
    });
  });
}
</script>

<template>
  <div ref="rootRef" :class="$style.root">
    <div ref="referenceCell" :class="$style.referenceCell">x</div>
    <div :class="['pl-scrollable', $style.table]">
      <div :class="$style.sidebar">
        <PhylogeneticTree
          v-if="widgets.includes('tree') && phylogeneticTree"
          :tree="phylogeneticTree"
          :class="$style.phylogeneticTree"
        />
        <div :class="$style.labels">
          <template v-for="column of labels">
            <div v-for="(label, index) of column" :key="index">{{ label }}</div>
          </template>
        </div>
      </div>
      <template v-if="letterSpacing !== undefined">
        <div
          v-for="(column, columnIndex) of sequences"
          :key="columnIndex"
          :class="$style.sequenceColumn"
        >
          <div :class="$style.sequenceHeader">
            <div v-show="sequences.length > 1" :class="$style.sequenceName">
              {{ column.name }}
            </div>
            <Consensus
              v-if="widgets.includes('consensus')"
              :residue-counts="column.residueCounts"
              :labels-class="$style.sequenceRow"
            />
            <SeqLogo
              v-if="widgets.includes('seqLogo')"
              :residue-counts="column.residueCounts"
            />
          </div>
          <div
            :class="$style.sequenceRowsContainer"
            :style="{
              backgroundImage: column.highlightImageUrl
                ? `url(${column.highlightImageUrl})`
                : undefined,
            }"
          >
            <div
              v-for="(row, rowIndex) of column.rows"
              :key="rowIndex"
              :class="$style.sequenceRow"
            >
              {{ row }}
            </div>
          </div>
        </div>
      </template>
      <div ref="corner" :class="$style.corner" />
    </div>
    <Legend
      v-if="widgets.includes('legend') && highlightLegend"
      :legend="highlightLegend"
    />
  </div>
</template>

<style module>
.root {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-block-size: 0;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;

  &[data-pre-print] {
    .table {
      container-type: unset;
    }
    .sidebar {
      max-inline-size: unset;
    }
  }
}

.referenceCell {
  position: fixed;
  visibility: hidden;
  font-family: Spline Sans Mono;
  font-weight: 600;
  line-height: v-bind("targetCellBlockSize");
}

.table {
  display: grid;
  grid-template-columns:
    [sidebar-start] auto [sidebar-end] repeat(
    v-bind("sequences.length"),
    [column-start] auto [column-end]
  );
  grid-template-rows:
    [header-start] auto [header-end]
    repeat(v-bind("rowCount"), [row-start] auto [row-end]);
  position: relative;
  @media print {
    overflow: visible;
  }
}

.sidebar {
  grid-column: sidebar;
  grid-row: 1 row-start / -1 row-end;
  display: grid;
  grid-template-rows: subgrid;
  position: sticky;
  inset-inline-start: 0;
  background-color: #fff;
}

.phylogeneticTree {
  grid-row: 1 row-start / -1 row-end;
  margin-block: -40px;
  margin-inline-start: -10px;
  margin-inline-end: -26px;
}

.labels {
  grid-row: 1 row-start / -1 row-end;
  display: grid;
  grid-template-columns: repeat(v-bind("labels.length"), auto);
  grid-template-rows: subgrid;
  grid-auto-flow: column;
  column-gap: 12px;
  padding-inline-end: 12px;
  font-family: Spline Sans Mono;
  line-height: v-bind("targetCellBlockSize");
  white-space: nowrap;
}

.sequenceColumn {
  grid-row: header-start / -1 row-end;
  display: grid;
  grid-template-rows: subgrid;
  & + & {
    margin-inline-start: 24px;
  }
}

.sequenceHeader {
  grid-row: header;
  display: flex;
  flex-direction: column;
  justify-content: end;
  min-inline-size: 0;
  position: sticky;
  inset-block-start: 0;
  background-color: #fff;
}

.sequenceName {
  margin-block-end: 4px;
  font-weight: 700;
  line-height: 20px;
  inline-size: fit-content;
  position: sticky;
  inset-inline-start: v-bind("sequenceNameInsetInlineStart");
}

.sequenceRowsContainer {
  grid-row: 1 row-start / -1 row-end;
  display: grid;
  grid-template-rows: subgrid;
}

.sequenceRow {
  font-family: Spline Sans Mono;
  font-weight: 600;
  line-height: v-bind("targetCellBlockSize");
  letter-spacing: v-bind("letterSpacing");
  text-indent: calc(v-bind("letterSpacing") / 2);
  inline-size: calc-size(
    min-content,
    round(down, size, v-bind("targetCellInlineSize"))
  );
  white-space: nowrap;
}

.corner {
  grid-column: sidebar;
  grid-row: header;
  position: sticky;
  inset-inline-start: 0;
  inset-block-start: 0;
  background-color: #fff;
}
</style>
