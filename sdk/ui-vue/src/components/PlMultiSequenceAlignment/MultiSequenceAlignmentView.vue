<script lang="ts" setup>
import { computedAsync, useObjectUrl } from '@vueuse/core';
import { computed } from 'vue';
import {
  chemicalPropertiesColorMap,
  colorizeSequencesByChemicalProperties,
} from './chemical-properties';
import Consensus from './Consensus.vue';
import { colorizeSequencesByMarkup, type Markup } from './markup';
import { getResidueCounts } from './residue-counts';
import SeqLogo from './SeqLogo.vue';
import type { ColorScheme } from './types';

const { sequenceRows, labelRows, markup, colorScheme } = defineProps<{
  sequenceRows: string[][];
  labelRows: string[][];
  markup: {
    labels: Record<string, string>;
    data: Markup[];
  } | undefined;
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

const highlightImageBlob = computedAsync(() => {
  switch (colorScheme.type) {
    case 'no-color':
      return;
    case 'chemical-properties':
      return colorizeSequencesByChemicalProperties({
        sequences: concatenatedSequences.value,
        residueCounts: residueCounts.value,
        colorMap: chemicalPropertiesColorMap,
      });
    case 'markup':
      return colorizeSequencesByMarkup({
        markupRows: markup?.data ?? [],
        colorMap: colorScheme.colors,
        columnCount: concatenatedSequences.value?.[0].length ?? 0,
      });
    default:
      throw new Error(`Unknown color scheme: ${colorScheme.type}`);
  }
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
  background-image: v-bind(highlightImage);
  background-repeat: no-repeat;
  background-size: calc(100% - 5.8px) 100%;
  image-rendering: pixelated;
}
</style>
