<script lang="ts" setup>
import { useObjectUrl } from '@vueuse/core';
import { computed } from 'vue';
import Consensus from './Consensus.vue';
import { colorizeSegmentedColumns } from './highlight';
import {
  alignedSequencesToSegmentedColumns,
  chemicalPropertiesColors,
  getColumnChemicalProperties,
} from './highlight/chemical-properties';
import { getResidueCounts } from './residue-counts';
import SeqLogo from './SeqLogo.vue';
import type { ColorScheme } from './types';

const { sequenceRows, labelRows, colorScheme } = defineProps<{
  sequenceRows: string[][];
  labelRows: string[][];
  colorScheme: ColorScheme;
  consensus: boolean;
  seqLogo: boolean;
}>();

const concatenatedSequences = computed(() =>
  sequenceRows.map((row) => row.join('')),
);

const residueCounts = computed(
  () => getResidueCounts(concatenatedSequences.value),
);

const segmentedColumns = computed(() => {
  const columnConsensuses = getColumnChemicalProperties({
    residueCounts: residueCounts.value,
    rowCount: sequenceRows.length,
  });
  const segmentedColumns = alignedSequencesToSegmentedColumns({
    alignedSequences: concatenatedSequences.value,
    consensuses: columnConsensuses,
  });
  return segmentedColumns;
});

const selectedColorScheme = computed(() => {
  switch (colorScheme) {
    case 'no-color':
      return;
    case 'chemical-properties':
      return segmentedColumns.value;
    default:
      throw new Error(`Unknown highlight ${colorScheme}`);
  }
});

const highlightImageBlob = computed(() => {
  const rowCount = sequenceRows.length;
  const columns = selectedColorScheme.value;
  if (!columns?.length) return;
  return colorizeSegmentedColumns({
    columns,
    rowCount,
    colors: chemicalPropertiesColors,
  });
});

const objectUrl = useObjectUrl(highlightImageBlob);

const highlightImage = computed(
  () => objectUrl.value ? `url('${objectUrl.value}')` : 'none',
);
</script>

<template>
  <div :class="['pl-scrollable', $style.root]">
    <div :class="$style.corner" />
    <div :class="$style.header">
      <Consensus v-if="consensus" :residueCounts />
      <SeqLogo v-if="seqLogo" :residueCounts />
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
        v-for="(sequence, sequenceIndex) of concatenatedSequences"
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
  padding-inline-end: 6px;
  background-color: white;
  position: sticky;
  inset-block-start: 0;
  z-index: 1;
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
  line-height: calc(24 / 14);
}

.sequences {
  grid-area: sequences;
  display: flex;
  flex-direction: column;
  font-family: Spline Sans Mono;
  font-weight: 600;
  line-height: calc(24 / 14);
  letter-spacing: 12px;
  text-indent: 6px;
  background-image: v-bind(highlightImage);
  background-repeat: no-repeat;
  background-size: calc(100% - 6px) 100%;
}
</style>
