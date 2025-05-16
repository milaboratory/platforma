<script lang="ts" setup>
import {
  ref,
  toRefs,
} from 'vue';
import {
  PlCheckbox,
  PlTooltip,
  PlIcon24,
} from '@milaboratories/uikit';
import {
  residueType,
  residueTypeLabels,
  residueTypeColorMap,
} from './utils/colors';
import type {
  AlignmentRow,
} from './types';

const props = defineProps<{
  output: AlignmentRow[];
}>();
const { output } = toRefs(props);

const showChemicalProperties = ref(true);

</script>

<template>
  <div v-if="output.length" :class="$style.output">
    <div>
      <span v-for="row in output" :key="row.header">
        {{ row.labels.join(', ') ?? 'Not found' }}
      </span>
    </div>
    <div class="pl-scrollable">
      <span v-for="alignmentRow of output" :key="alignmentRow.header" :class="$style.sequence">
        <span
          v-for="highlight in alignmentRow.highlighted"
          :key="highlight.residue"
          :style="{
            ...(showChemicalProperties && {
              backgroundColor: residueTypeColorMap[highlight.color],
              color: highlight.color === 'unconserved_or_default' ? '#000000' : '#ffffff'
            }),
          }"
        >
          {{ highlight.residue }}
        </span>
      </span>
    </div>
  </div>
  <div v-if="output.length" :class="$style['checkbox-panel']">
    <PlCheckbox v-model="showChemicalProperties">Show chemical properties</PlCheckbox>
    <PlTooltip style="display: flex; align-items: center;">
      <PlIcon24 name="info" />
      <template #tooltip>
        <div
          v-for="type in residueType"
          :key="type"
        >
          <span
            :class="$style['color-sample']"
            :style="{ backgroundColor: residueTypeColorMap[type] }"
          />
          {{ residueTypeLabels[type] }}
        </div>
      </template>
    </PlTooltip>
  </div>
</template>

<style module>
.checkbox-panel {
  display: flex;
  align-items: center;
  gap: 8px;
}

.output {
  white-space: pre;
  font-family: monospace;
  display: grid;
  grid-template-columns: max-content 1fr;
  max-height: 100%;
  overflow: auto;
  padding: 4px 0;
  > div {
    padding: 4px;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  > div:first-child {
    background-color: #f0f0f0;
    border: 1px solid #f0f0f0;
  }
  > div:last-child {
    border: 1px solid #f0f0f0;
    border-left: none;
    overflow-x: auto;
    overflow-y: hidden;
    max-width: 100%;
  }
}

.sequence {
  > span {
    width: 14px;
    padding: 0 2px;
    display: inline-block;
  }
}

.color-sample {
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 1px solid #ccc;
  margin-right: 8px;
  vertical-align: middle;
}
</style>
