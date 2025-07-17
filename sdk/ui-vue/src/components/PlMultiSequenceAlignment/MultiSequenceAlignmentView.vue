<script lang="ts" setup>
import { useObjectUrl } from '@vueuse/core';
import { computed, useTemplateRef } from 'vue';
import Consensus from './Consensus.vue';
import Legend from './Legend.vue';
import SeqLogo from './SeqLogo.vue';
import type { HighlightLegend, ResidueCounts } from './types';

const { sequences, highlightImage } = defineProps<{
  sequences: string[];
  sequenceNames: string[];
  labelRows: string[][];
  residueCounts: ResidueCounts;
  highlightImage: {
    blob: Blob;
    legend: HighlightLegend;
  } | undefined;
  widgets: ('consensus' | 'seqLogo' | 'legend')[];
}>();

const rootEl = useTemplateRef('rootRef');
defineExpose({ rootEl });

const highlightImageObjectUrl = useObjectUrl(() => highlightImage?.blob);
const highlightImageCssUrl = computed(() =>
  highlightImageObjectUrl.value
    ? `url('${highlightImageObjectUrl.value}')`
    : 'none',
);

const sequenceLengths = computed(() =>
  sequences.at(0)?.split(' ').map(({ length }) => length),
);
</script>

<template>
  <div ref="rootRef" :class="$style.root">
    <div :class="['pl-scrollable', $style.table]">
      <div :class="$style.corner" />
      <div :class="$style.header">
        <div v-if="sequenceNames.length > 1" :class="$style['sequence-names']">
          <span
            v-for="(name, index) of sequenceNames"
            :key="index"
            :style="{
              inlineSize: ((sequenceLengths?.at(index) ?? 0) * 20)
                + 'px',
            }"
          >{{ name }}</span>
        </div>
        <Consensus v-if="widgets.includes('consensus')" :residue-counts />
        <SeqLogo v-if="widgets.includes('seqLogo')" :residue-counts />
      </div>
      <div :class="$style.labels">
        <template v-for="(labelRow, rowIndex) of labelRows">
          <div
            v-for="(label, labelIndex) of labelRow"
            :key="labelIndex"
            :style="{ gridRow: rowIndex + 1 }"
          >
            {{ label }}
          </div>
        </template>
      </div>
      <div :class="$style.sequences">
        <div
          v-for="(sequence, index) of sequences"
          :key="index"
        >
          {{ sequence }}
        </div>
      </div>
    </div>
    <Legend
      v-if="widgets?.includes('legend') && highlightImage?.legend"
      :legend="highlightImage.legend"
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
}

.table {
  display: grid;
  grid-template-areas:
    "corner header"
    "labels sequences";
  text-wrap: nowrap;
  justify-content: start;
  @media print {
    overflow: visible;
  }
}

.corner {
  grid-area: corner;
  background-color: white;
  position: sticky;
  inset-inline-start: 0;
  inset-block-start: 0;
  z-index: 2;
}

.header {
  grid-area: header;
  background-color: white;
  position: sticky;
  inset-block-start: 0;
  z-index: 1;
}

.sequence-names {
  display: flex;
  font-weight: 700;
  line-height: 20px;
  margin-block-end: 4px;
  gap: 20px;
}

.labels {
  grid-area: labels;
  display: grid;
  grid-auto-flow: dense;
  column-gap: 12px;
  background-color: white;
  position: sticky;
  inset-inline-start: 0;
  z-index: 1;
  padding-inline-end: 12px;
  font-family: Spline Sans Mono;
  line-height: 24px;
}

.sequences {
  grid-area: sequences;
  display: flex;
  flex-direction: column;
  font-family: Spline Sans Mono;
  font-weight: 600;
  line-height: 24px;
  letter-spacing: 11.6px;
  text-indent: 5.8px;
  margin-inline-end: -5.8px;
  background-image: v-bind(highlightImageCssUrl);
  background-repeat: no-repeat;
  background-size: calc(100% - 5.8px) 100%;
}
</style>
