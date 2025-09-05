<script lang="ts" setup>
import type { PlMultiSequenceAlignmentWidget } from '@platforma-sdk/model';
import {
  computed,
  onBeforeMount,
  onBeforeUnmount,
  onWatcherCleanup,
  ref,
  useCssModule,
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

const props = defineProps<{
  sequences: {
    name: string;
    rows: string[];
    residueCounts: ResidueCounts;
    highlightImageUrl?: string;
  }[];
  labels: {
    rows: string[];
  }[];
  highlightLegend: HighlightLegend | undefined;
  phylogeneticTree: TreeNodeData[] | undefined;
  widgets: PlMultiSequenceAlignmentWidget[];
}>();

const classes = useCssModule();

const rootEl = useTemplateRef('rootRef');
defineExpose({ rootEl });

const rowCount = computed(() => props.sequences.at(0)?.rows.length ?? 0);

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
  <div ref="rootRef" :class="classes.root">
    <div ref="referenceCell" :class="classes.referenceCell">x</div>
    <div :class="['pl-scrollable', classes.table]">
      <div :class="classes.sidebar">
        <PhylogeneticTree
          v-if="props.widgets.includes('tree') && props.phylogeneticTree"
          :tree="props.phylogeneticTree"
          :class="classes.phylogeneticTree"
        />
        <div :class="classes.labels">
          <template
            v-for="({ rows }, columnIndex) of props.labels"
            :key="columnIndex"
          >
            <div v-for="(row, rowIndex) of rows" :key="rowIndex">
              {{ row }}
            </div>
          </template>
        </div>
      </div>
      <template v-if="letterSpacing !== undefined">
        <div
          v-for="(column, columnIndex) of props.sequences"
          :key="columnIndex"
          :class="classes.sequenceColumn"
        >
          <div :class="classes.sequenceHeader">
            <div
              v-show="props.sequences.length > 1"
              :class="classes.sequenceName"
            >
              {{ column.name }}
            </div>
            <Consensus
              v-if="props.widgets.includes('consensus')"
              :residue-counts="column.residueCounts"
              :labels-class="classes.sequenceRow"
            />
            <SeqLogo
              v-if="props.widgets.includes('seqLogo')"
              :residue-counts="column.residueCounts"
            />
          </div>
          <div
            :class="classes.sequenceRowsContainer"
            :style="{
              backgroundImage: column.highlightImageUrl
                ? `url(${column.highlightImageUrl})`
                : undefined,
            }"
          >
            <div
              v-for="(row, rowIndex) of column.rows"
              :key="rowIndex"
              :class="classes.sequenceRow"
            >
              {{ row }}
            </div>
          </div>
        </div>
      </template>
      <div ref="corner" :class="classes.corner" />
    </div>
    <Legend
      v-if="props.widgets.includes('legend') && props.highlightLegend"
      :legend="props.highlightLegend"
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
  container-type: inline-size;

  &[data-pre-print] {
    container-type: unset;

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
  line-height: v-bind('targetCellBlockSize');
}

.table {
  display: grid;
  grid-template-columns:
    [sidebar-start] auto [sidebar-end] repeat(
    v-bind('props.sequences.length'),
    [column-start] auto [column-end]
  );
  grid-template-rows:
    [header-start] auto [header-end]
    repeat(v-bind('rowCount'), [row-start] auto [row-end]);
  justify-content: start;
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
  inline-size: min-content;
  max-inline-size: 30cqi;
  overflow: scroll;
  overscroll-behavior-inline: none;
  scrollbar-width: none;
}

.phylogeneticTree {
  grid-row: 1 row-start / -1 row-end;
}

.labels {
  grid-row: 1 row-start / -1 row-end;
  display: grid;
  grid-template-columns: repeat(v-bind('props.labels.length'), auto);
  grid-template-rows: subgrid;
  grid-auto-flow: column;
  column-gap: 12px;
  padding-inline-end: 12px;
  font-family: Spline Sans Mono;
  line-height: v-bind('targetCellBlockSize');
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
  inset-inline-start: v-bind('sequenceNameInsetInlineStart');
}

.sequenceRowsContainer {
  grid-row: 1 row-start / -1 row-end;
  display: grid;
  grid-template-rows: subgrid;
}

.sequenceRow {
  font-family: Spline Sans Mono;
  font-weight: 600;
  line-height: v-bind('targetCellBlockSize');
  letter-spacing: v-bind('letterSpacing');
  text-indent: calc(v-bind('letterSpacing') / 2);
  inline-size: calc-size(
    min-content,
    round(down, size, v-bind('targetCellInlineSize'))
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
