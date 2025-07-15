<script lang="ts" setup>
import { useBase64 } from '@vueuse/core';
import { computed } from 'vue';
import Consensus from './Consensus.vue';
import SeqLogo from './SeqLogo.vue';
import type { ResidueCounts } from './types';

const { sequences, highlightImageBlob } = defineProps<{
  sequenceNames: string[];
  sequences: string[];
  labelRows: string[][];
  residueCounts: ResidueCounts;
  highlightImageBlob: Blob | undefined;
  consensus: boolean;
  seqLogo: boolean;
}>();

const { base64: highlightImageBase64 } = useBase64(() => highlightImageBlob);

const highlightImageUrl = computed(() =>
  highlightImageBase64.value
    ? `url('${highlightImageBase64.value}')`
    : 'none',
);

const sequenceLengths = computed(() =>
  sequences.at(0)?.split(' ').map(({ length }) => length),
);
</script>

<template>
  <div :class="['pl-scrollable', $style.root]">
    <div :class="$style.corner" />
    <div :class="$style.header">
      <div v-if="sequenceNames.length > 1" :class="$style['sequence-names']">
        <span
          v-for="(name, index) of sequenceNames"
          :key="index"
          :style="
            {
              inlineSize: `calc(${
                sequenceLengths?.at(index) ?? 0
              } * 20px)`,
            }
          "
        >{{ name }}</span>
      </div>
      <Consensus v-if="consensus" :residue-counts />
      <SeqLogo v-if="seqLogo" :residue-counts />
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
  background-image: v-bind(highlightImageUrl);
  background-repeat: no-repeat;
  background-size: calc(100% - 5.8px) 100%;
  image-rendering: pixelated;
}
</style>
