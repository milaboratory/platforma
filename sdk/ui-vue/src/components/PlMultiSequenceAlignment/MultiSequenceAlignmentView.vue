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
      <div :class="$style.corner">
        <div :class="$style['label-scroll-indicator']" />
      </div>
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
        <div :class="$style['labels-grid']">
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

  &[data-pre-print] {
    .table {
      container-type: unset;
    }
    .labels {
      max-inline-size: unset;
    }
  }
}

.table {
  container-type: inline-size;
  display: grid;
  grid-template-areas:
    "corner header"
    "labels sequences";
  justify-content: start;
  timeline-scope: --msa-labels-scroll;
  @media print {
    overflow: visible;
  }
}

.corner {
  grid-area: corner;
  background-color: #fff;
  position: sticky;
  inset-inline-start: 0;
  inset-block-start: 0;
  z-index: 2;
}

.label-scroll-indicator {
  position: absolute;
  inset-inline-end: 0;
  block-size: 100cqb;
  inline-size: 8px;
  animation-name: hide;
  animation-timeline: --msa-labels-scroll;
  visibility: hidden;
  background: #fff;
  box-shadow: -4px 0 4px -2px rgba(0, 0, 0, 0.10);
}

.header {
  grid-area: header;
  background-color: #fff;
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
  background-color: #fff;
  position: sticky;
  inset-inline-start: 0;
  z-index: 1;
  inline-size: max-content;
  max-inline-size: 30cqi;
  overflow: scroll;
  scrollbar-width: none;
  overscroll-behavior-inline: none;
  scroll-timeline: --msa-labels-scroll inline;
}

.labels-grid {
  display: grid;
  grid-auto-flow: dense;
  font-family: Spline Sans Mono;
  line-height: 24px;
  text-wrap: nowrap;

  > * {
    padding-inline-end: 12px;
  }
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

@keyframes hide {
  from {
    visibility: visible;
  }
  to {
    visibility: hidden;
  }
}
</style>
