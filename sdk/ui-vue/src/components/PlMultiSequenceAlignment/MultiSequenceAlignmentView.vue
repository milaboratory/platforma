<script lang="ts" setup>
import { computed } from 'vue';
import { getCssBackgroundImage } from './highlight';
import {
  chemicalPropertiesColors,
  useChemicalPropertiesHighlight,
} from './highlight/chemical-properties';
import { useAlignedRows } from './multi-sequence-alignment';
import type { SequenceRow } from './types';

const { sequenceRows, highlight } = defineProps<{
  sequenceRows: SequenceRow[];
  highlight?: 'chemical-properties' | undefined;
}>();

const alignedRows = useAlignedRows(() => sequenceRows);

const chemicalPropertiesHighlight = useChemicalPropertiesHighlight(() => {
  if (highlight !== 'chemical-properties' || alignedRows.loading) {
    return;
  }
  return sequenceRows.map(({ header }) => {
    const row = alignedRows.value.get(header);
    if (!row) {
      console.error(`Missing aligned row for header ${header}`);
    }
    return alignedRows.value.get(header) ?? '';
  });
});

const columnCount = computed(
  () => (sequenceRows.at(0)?.labels.length ?? 0) + 1,
);
const rowCount = computed(() => sequenceRows.length);

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
</script>

<template>
  <div v-if="!alignedRows.loading" :class="['pl-scrollable', $style.container]">
    <div
      v-if="selectedHighlight && !selectedHighlight.loading"
      :class="$style.highlight"
      :style="
        {
          backgroundImage: getCssBackgroundImage({
            columns: selectedHighlight.value,
            rowCount: sequenceRows.length,
            colors: chemicalPropertiesColors,
          }),
        }
      "
    />
    <template
      v-for="row of sequenceRows"
      :key="row.header"
    >
      <div
        v-for="(label, labelIndex) of row.labels"
        :key="labelIndex"
        :class="
          [
            $style.label,
            labelIndex === row.labels.length - 1 && $style.last,
          ]
        "
      >
        {{ label }}
      </div>
      <div :class="$style.sequence">
        {{ alignedRows.value.get(row.header) }}
      </div>
    </template>
  </div>
</template>

<style module>
.container {
  flex: 1;
  position: relative;
  font-family: Spline Sans Mono;
  text-wrap: nowrap;
  display: grid;
  grid-template-columns: repeat(v-bind(columnCount), min-content);
  grid-template-rows: repeat(v-bind(rowCount), min-content);
  justify-content: start;
  column-gap: 16px;
  font-size: calc(16rem / 14);
  line-height: 1.5;

  * {
    content-visibility: auto;
  }
}

.highlight {
  position: absolute;
  inset: 0;
  grid-area: 1 / -2 / -1 / -1; /* all rows and last column */
  background-repeat: no-repeat;
  content-visibility: visible;
}

.label {
  background-color: white;
  position: sticky;
  inset-inline-start: 0;
  text-align: end;
  z-index: 1;

  &.last {
    padding-inline-end: 16px;
    border-inline-end: 1px solid black;
  }
}
</style>
