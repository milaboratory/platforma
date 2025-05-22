<script lang="ts" setup>
import { PlSplash } from '@milaboratories/uikit';
import { useObjectUrl } from '@vueuse/core';
import { computed, reactive } from 'vue';
import Consensus from './Consensus.vue';
import { colorizeSegmentedColumns } from './highlight';
import {
  alignedSequencesToSegmentedColumns,
  chemicalPropertiesColors,
  getColumnChemicalProperties,
} from './highlight/chemical-properties';
import { useAlignedSequences } from './multi-sequence-alignment';
import { getResidueCounts } from './residue-counts';
import SeqLogo from './SeqLogo.vue';
import type { ColorScheme, SequenceRow } from './types';

const { sequenceRows, colorScheme } = defineProps<{
  sequenceRows: SequenceRow[];
  colorScheme: ColorScheme;
  consensus: boolean;
  seqLogo: boolean;
}>();

const alignedSequences = reactive(useAlignedSequences(
  () => sequenceRows.map(({ sequence }) => sequence),
));

const residueCounts = computed(
  () => getResidueCounts(alignedSequences.data),
);

const segmentedColumns = computed(() => {
  const columnConsensuses = getColumnChemicalProperties({
    residueCounts: residueCounts.value,
    rowCount: alignedSequences.data.length,
  });
  const segmentedColumns = alignedSequencesToSegmentedColumns({
    alignedSequences: alignedSequences.data,
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
  <PlSplash
    :class="['pl-scrollable', $style.root]"
    :loading="alignedSequences.loading"
    type="transparent"
  >
    <div :class="$style.corner" />
    <div :class="$style.header">
      <Consensus v-if="consensus" :residueCounts />
      <SeqLogo v-if="seqLogo" :residueCounts />
    </div>
    <template v-if="alignedSequences.data.length">
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
          v-for="(sequence, sequenceIndex) of alignedSequences.data"
          :key="sequenceIndex"
        >
          {{ sequence }}
        </div>
      </div>
    </template>
  </PlSplash>
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
  letter-spacing: 12px;
  text-indent: 6px;
  background-image: v-bind(highlightImage);
  background-repeat: no-repeat;
  background-size: calc(100% - 6px) 100%;
}
</style>
