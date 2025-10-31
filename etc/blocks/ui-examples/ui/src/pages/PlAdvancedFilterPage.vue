<script setup lang="ts">
import type { FilterSpec, ListOptionBase, SUniversalPColumnId } from '@platforma-sdk/model';
import { PlAdvancedFilter, PlBlockPage, PlCheckbox, PlDropdown } from '@platforma-sdk/ui-vue';
import { computed, ref, watch } from 'vue';

const uniqueValuesByColumnOrAxisId: Record<string, ListOptionBase<string>[]> = {
  1: [{ value: '1', label: 'Value 1' }, { value: '2', label: 'Value 2' }],
  2: [{ value: '3', label: 'Value 3' }, { value: '4', label: 'Value 4' }],
  3: [{ value: '5', label: 'Value 5' }, { value: '6', label: 'Value 6' }],
};
const uniqueValuesByAxisIdx: Record<string, Record<number, ListOptionBase<string>[]>> = {
  1: { 0: [{ value: 'axisValue1', label: 'Axis Value 1' }, { value: 'axisValue2', label: 'Axis Value 2' }] },
};

const options = [
  {
    id: '1' as SUniversalPColumnId,
    info: {
      label: 'Column 1',
      error: false,
      axesToBeFixed: [{
        idx: 0,
        label: 'Axis 1 label',
        info: {
          label: 'Axis 1 label',
          spec: { type: 'String' as const, name: 'nameAxis1' },
          uniqueValues: [{ value: 'axisValue1', label: 'Axis Value 1' }, { value: 'axisValue2', label: 'Axis Value 2' }],
        },
      }],
      spec: { kind: 'PColumn' as const, valueType: 'Int' as const, name: 'c1', axesSpec: [{ type: 'String' as const, name: 'nameAxis1' }] },
    },
  },
  {
    id: '2' as SUniversalPColumnId,
    info: {
      label: 'Column 2',
      error: false,
      spec: { kind: 'PColumn' as const, valueType: 'String' as const, name: 'c2', axesSpec: [] },
    },
  },
  {
    id: '3' as SUniversalPColumnId,
    info: {
      label: 'Column 3',
      error: false,
      spec: { kind: 'PColumn' as const, valueType: 'Double' as const, name: 'c3', axesSpec: [] },
    },
  },
];
const dndMode = ref(false);
const draggedId = ref<string | undefined>();

async function searchOptions(id: string, str: string, axisIdx?: number) {
  if (axisIdx !== undefined) {
    return uniqueValuesByAxisIdx[id]?.[axisIdx] || [];
  }
  return uniqueValuesByColumnOrAxisId[id] || [];
}
async function searchModel(id: string, modelStr: string, axisIdx?: number) {
  if (axisIdx !== undefined) {
    const axisValues = uniqueValuesByAxisIdx[id]?.[axisIdx];
    return axisValues.find((v) => v.value === modelStr) || { value: modelStr, label: `Label of ${modelStr}` };
  }
  const columnValues = uniqueValuesByColumnOrAxisId[id];
  return columnValues.find((v) => v.value === modelStr) || { value: modelStr, label: `Label of ${modelStr}` };
}

const errorState = {
  type: 'and' as const,
  filters: [
    {
      type: 'and' as const,
      filters: [
        {
          type: 'patternEquals' as const,
          column: 'someColumn' as SUniversalPColumnId, // error - column id is not from available columns
          value: 'A',
        },
        {
          type: 'or' as const,
          filters: [
            {
              type: 'patternEquals' as const,
              column: 'someColumn' as SUniversalPColumnId, // error - column id is not from available columns
              value: 'A',
            },
          ],
        },
      ],
    }, {
      type: 'and' as const,
      filters: [
        {
          type: 'isNA' as const,
          column: 'someColumn' as SUniversalPColumnId, // error - column id is not from available columns
        },
        {
          type: 'isNotNA' as const,
          column: 'someColumn' as SUniversalPColumnId, // error - column id is not from available columns
        },
      ],
    }, {
      type: 'and' as const,
      filters: [
        {
          type: 'patternContainSubsequence' as const,
          column: 'someColumn' as SUniversalPColumnId, // error - column id is not from available columns
          value: 'someString',
        },
      ],
    }],
};

const normalState: FilterSpec = {
  type: 'and' as const,
  filters: [
    {
      type: 'or' as const,
      filters: [{
        type: 'isNA' as const,
        column: '1' as SUniversalPColumnId,
      }, {
        type: 'equal' as const,
        column: '2' as SUniversalPColumnId,
        x: 10,
      }],
    },
    {
      type: 'and' as const,
      filters: [
        {
          type: 'isNotNA' as const,
          column: '3' as SUniversalPColumnId,
        }, {
          type: 'patternFuzzyContainSubsequence' as const,
          column: '3' as SUniversalPColumnId,
          value: 'abc',
        },
      ],
    },
  ],
};

const filterStates: Record<string, FilterSpec> = {
  normalState: normalState,
  errorState: errorState,
  emptyState: {
    type: 'and',
    filters: [],
  },
};

const filtersModel = computed<FilterSpec>({
  get: () => {
    return filterStates[selectedSavedFilters.value];
  },
  set: (v) => {
    console.log('updated filters state: ', v);
  },
});

const selectedSavedFilters = ref<keyof typeof filterStates>('normalState');
const filterStatesOptions = [
  { value: 'normalState', label: 'Normal state' },
  { value: 'errorState', label: 'State with errors' },
  { value: 'emptyState', label: 'Empty state' },
];

watch(() => filtersModel.value, (m) => {
  console.log('Model changed: ', m);
});
</script>

<template>
  <PlBlockPage>
    <div :class="$style.controls">
      <PlCheckbox v-model="dndMode" >Drag-n-Drop mode</PlCheckbox>
      <PlDropdown v-model="selectedSavedFilters" :options="filterStatesOptions" label="Examples" :style="{width: '300px'}" />
    </div>
    <div :class="$style.block">
      <div v-if="dndMode" :class="$style.leftColumn">
        <div
          v-for="option in options"
          :key="option.id"
          :draggable="dndMode ? 'true' : undefined"
          :class="$style.columnChip"
          @dragstart="() => draggedId = option.id"
          @dragend="() => draggedId = undefined"
        >
          {{ option.info.label }}
        </div>
      </div>
      <div :key="selectedSavedFilters" :class="$style.rightColumn" >
        <PlAdvancedFilter
          v-model="filtersModel"
          :items="options"
          :dnd-mode="dndMode"
          :dragged-id="draggedId"
          :search-options="searchOptions"
          :search-model="searchModel"
        />
      </div>
    </div>
  </PlBlockPage>
</template>
<style module>
.controls {
  display: flex;
  gap: 16px;
}
.block {
  display: flex;
  height: 100%;
  overflow: hidden;
}
.leftColumn {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 280px;
  padding: 10px;
  margin: 10px;
  border: 1px solid grey;
}
.rightColumn {
  display: flex;
  flex-direction: column;
  width: 280px;
  height: 100%;
  overflow: auto;
}
.columnChip {
  background: #fff;
  border: 1px solid black;
  border-radius: 6px;
  padding: 6px;
}
</style>
