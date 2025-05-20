<script lang="ts" setup>
import { computed, onWatcherCleanup, reactive, ref, watchEffect } from 'vue';
import { getResidueFrequencies } from './alignment-stats';
import { getHighlightImageBlob } from './highlight';
import {
  chemicalPropertiesColors,
  useChemicalPropertiesHighlight,
} from './highlight/chemical-properties';
import { useAlignedRows } from './multi-sequence-alignment';
import SeqLogo from './SeqLogo.vue';
import type { SequenceRow } from './types';

const { sequenceRows, highlight } = defineProps<{
  sequenceRows: SequenceRow[];
  highlight?: 'chemical-properties' | undefined;
}>();

const alignedRows = reactive(
  useAlignedRows(() => sequenceRows),
);

const chemicalPropertiesHighlight = reactive(
  useChemicalPropertiesHighlight(() => alignedRows.data),
);

const selectedHighlight = computed(() => {
  if (!highlight) {
    return;
  }
  switch (highlight) {
    case 'chemical-properties':
      return chemicalPropertiesHighlight;
    default:
      throw new Error(`Unknown highlight ${highlight}`);
  }
});

const highlightImage = ref<string>('none');

watchEffect(async () => {
  const rowCount = sequenceRows.length;
  const columns = selectedHighlight.value?.data;
  if (!columns?.length) {
    highlightImage.value = 'none';
    return;
  }
  const blob = getHighlightImageBlob({
    columns,
    rowCount,
    colors: chemicalPropertiesColors,
  });
  const url = URL.createObjectURL(blob);
  onWatcherCleanup(() => {
    URL.revokeObjectURL(url);
  });
  highlightImage.value = `url('${url}')`;
});

const sequenceLetterSpacing = '12px';
</script>

<template>
  <div v-if="alignedRows.data" :class="['pl-scrollable', $style.root]">
    <div :class="$style.corner" />
    <div :class="$style.header">
      <div :class="$style['seq-logo-container']">
        <SeqLogo
          :class="$style['seq-logo']"
          :residue-frequencies="getResidueFrequencies(alignedRows.data)"
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
      <!-- <div
        v-for="(column, columnIndex) of gridData.labelColumns"
        :key="columnIndex"
        :class="$style['label-column']"
      >
        <div v-for="(label, labelIndex) of column" :key="labelIndex">
          {{ label }}
        </div>
      </div> -->
    </div>
    <div :class="$style['sequence-data']">
      <div
        v-for="(sequence, sequenceIndex) of alignedRows.data"
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
  z-index: 1;
}

.header {
  grid-area: header;
  padding-inline-end: calc(v-bind(sequenceLetterSpacing) / 2);
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

  * {
    content-visibility: auto;
  }
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

  * {
    content-visibility: auto;
  }
}
</style>
