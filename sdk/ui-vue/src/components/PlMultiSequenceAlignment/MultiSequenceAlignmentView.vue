<script lang="ts" setup>
import { useObjectUrl } from '@vueuse/core';
import { computed } from 'vue';
import { colorizeSegmentedColumns } from './highlight';
import {
  alignedSequencesToSegmentedColumns,
  chemicalPropertiesColors,
  getColumnConsensuses,
} from './highlight/chemical-properties';
import { useAlignedSequences } from './multi-sequence-alignment';
import { getResidueFrequencies } from './residue-frequencies';
import SeqLogo from './SeqLogo.vue';
import type { ColorScheme, SequenceRow } from './types';

const { sequenceRows, colorScheme: highlight } = defineProps<{
  sequenceRows: SequenceRow[];
  colorScheme: ColorScheme | undefined;
  seqLogo: boolean;
}>();

const alignedSequences = useAlignedSequences(
  () => sequenceRows.map(({ sequence }) => sequence),
);

const residueFrequencies = computed(
  () => getResidueFrequencies(alignedSequences.value),
);

const segmentedColumns = computed(() => {
  const columnConsensuses = getColumnConsensuses({
    residueFrequencies: residueFrequencies.value,
    rowCount: alignedSequences.value.length,
  });
  const segmentedColumns = alignedSequencesToSegmentedColumns({
    alignedSequences: alignedSequences.value,
    consensuses: columnConsensuses,
  });
  return segmentedColumns;
});

const selectedHighlight = computed(() => {
  if (!highlight) {
    return;
  }
  switch (highlight) {
    case 'chemical-properties':
      return segmentedColumns.value;
    default:
      throw new Error(`Unknown highlight ${highlight}`);
  }
});

const highlightImageBlob = computed(() => {
  const rowCount = sequenceRows.length;
  const columns = selectedHighlight.value;
  if (!columns?.length) {
    return;
  }
  return colorizeSegmentedColumns({
    columns,
    rowCount,
    colors: chemicalPropertiesColors,
  });
});

const objectUrl = useObjectUrl(highlightImageBlob);

const highlightImage = computed(() => {
  if (!objectUrl.value) {
    return 'none';
  }
  return `url('${objectUrl.value}')`;
});

const sequenceLetterSpacing = '12px';
</script>

<template>
  <div v-if="alignedSequences.length" :class="['pl-scrollable', $style.root]">
    <div :class="$style.corner" />
    <div :class="$style.header">
      <div v-if="seqLogo" :class="$style['seq-logo-container']">
        <SeqLogo
          :class="$style['seq-logo']"
          :residue-frequencies="residueFrequencies"
        />
      </div>
    </div>
    <div :class="$style['labels-container']">
      <template v-for="({ labels }, rowIndex) of sequenceRows">
        <div
          v-for="(label, labelIndex) of labels"
          :key="labelIndex"
          :style="{ gridRow: rowIndex + 1 }"
        >
          {{ label }}
        </div>
      </template>
    </div>
    <div :class="$style['sequence-data']">
      <div
        v-for="(sequence, sequenceIndex) of alignedSequences"
        :key="sequenceIndex"
      >
        {{ sequence }}
      </div>
    </div>
  </div>
</template>

<style module>
.root {
  display: grid;
  grid-template-areas:
    "corner header"
    "labels sequences";
  text-wrap: nowrap;
  justify-content: start;
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
  padding-inline-end: calc(v-bind(sequenceLetterSpacing) / 2);
  background-color: white;
  position: sticky;
  inset-block-start: 0;
  z-index: 1;
}

.seq-logo-container {
  position: relative;
  block-size: 76px;
}

.seq-logo {
  position: absolute;
  inset: 0;
}

.labels-container {
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
  line-height: calc(24 / 14);
}

.sequence-data {
  grid-area: sequences;
  display: flex;
  flex-direction: column;
  font-family: Spline Sans Mono;
  font-weight: 600;
  line-height: calc(24 / 14);
  background-image: v-bind(highlightImage);
  background-repeat: no-repeat;
  background-size: calc(100% - v-bind(sequenceLetterSpacing) / 2) 100%;
  letter-spacing: v-bind(sequenceLetterSpacing);
  text-indent: calc(v-bind(sequenceLetterSpacing) / 2);
}
</style>
