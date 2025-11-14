<script setup lang="ts">
import { AxisId, CanonicalizedJson, stringifyColumnId, type FilterSpec, type ListOptionBase, type SUniversalPColumnId } from '@platforma-sdk/model';
import { PlAdvancedFilter, PlBlockPage, PlCheckbox, PlDropdown } from '@platforma-sdk/ui-vue';
import { computed, ref, watch } from 'vue';

const column1Id = stringifyColumnId({ name: '1', axes: [] }) as SUniversalPColumnId;
const column2Id = stringifyColumnId({ name: '2', axes: [] }) as SUniversalPColumnId;
const column3Id = stringifyColumnId({ name: '3', axes: [] }) as SUniversalPColumnId;

const inconsistentColumnId = '{"name":"someColumn","axes":[]}' as SUniversalPColumnId;

const uniqueValuesByColumnOrAxisId: Record<string, ListOptionBase<string>[]> = {
  [column1Id]: [{ value: '1', label: 'Value 1' }, { value: '2', label: 'Value 2' }],
  [column2Id]: [{ value: '3', label: 'Value 3' }, { value: '4', label: 'Value 4' }],
  [column3Id]: [{ value: '5', label: 'Value 5' }, { value: '6', label: 'Value 6' }],
};
const uniqueValuesByAxisIdx: Record<string, Record<number, ListOptionBase<string>[]>> = {
  [column1Id]: { 0: [{ value: 'axisValue1', label: 'Axis Value 1' }, { value: 'axisValue2', label: 'Axis Value 2' }] },
};

const options = [
  {
    id: column1Id,
    label: 'Column 1',
    error: false,
    axesToBeFixed: [{
      idx: 0,
      label: 'Axis 1 label',
    }],
    spec: { kind: 'PColumn' as const, valueType: 'Int' as const, name: 'c1', axesSpec: [{ type: 'String' as const, name: 'nameAxis1' }] },
  },
  {
    id: column2Id,
    label: 'Column 2',
    error: false,
    spec: { kind: 'PColumn' as const, valueType: 'String' as const, name: 'c2', axesSpec: [] },
  },
  {
    id: column3Id,
    label: 'Column 3',
    error: false,
    spec: { kind: 'PColumn' as const, valueType: 'Double' as const, name: 'c3', axesSpec: [] },
  },
];
const enableDnd = ref(false);

async function getSuggestOptions({ columnId, searchStr, axisIdx }: { columnId: SUniversalPColumnId | CanonicalizedJson<AxisId>; searchStr: string; axisIdx?: number }) {
  if (axisIdx !== undefined) {
    return (uniqueValuesByAxisIdx[columnId]?.[axisIdx] || []).filter((v) => v.label.includes(searchStr));
  }
  return (uniqueValuesByColumnOrAxisId[columnId] || []).filter((v) => v.label.includes(searchStr));
}
async function getSuggestModel({ columnId, searchStr, axisIdx }: { columnId: SUniversalPColumnId | CanonicalizedJson<AxisId>; searchStr: string; axisIdx?: number }) {
  if (axisIdx !== undefined) {
    const axisValues = uniqueValuesByAxisIdx[columnId]?.[axisIdx];
    return axisValues.find((v) => v.value === searchStr) || { value: searchStr, label: `Label of ${searchStr}` };
  }
  const columnValues = uniqueValuesByColumnOrAxisId[columnId];
  return columnValues.find((v) => v.value === searchStr) || { value: searchStr, label: `Label of ${searchStr}` };
}

const errorState = {
  type: 'and' as const,
  filters: [
    {
      type: 'and' as const,
      filters: [
        {
          type: 'patternEquals' as const,
          column: inconsistentColumnId, // error - column id is not from available columns
          value: 'A',
        },
        {
          type: 'or' as const,
          filters: [
            {
              type: 'patternEquals' as const,
              column: inconsistentColumnId, // error - column id is not from available columns
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
          column: inconsistentColumnId, // error - column id is not from available columns
        },
        {
          type: 'isNotNA' as const,
          column: inconsistentColumnId, // error - column id is not from available columns
        },
      ],
    }, {
      type: 'and' as const,
      filters: [
        {
          type: 'patternContainSubsequence' as const,
          column: inconsistentColumnId, // error - column id is not from available columns
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
        column: column1Id,
      }, {
        type: 'equal' as const,
        column: column2Id,
        x: 10,
      }],
    },
    {
      type: 'and' as const,
      filters: [
        {
          type: 'isNotNA' as const,
          column: column3Id,
        }, {
          type: 'patternFuzzyContainSubsequence' as const,
          column: column3Id,
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
      <PlCheckbox v-model="enableDnd" >Drag-n-Drop mode</PlCheckbox>
      <PlDropdown v-model="selectedSavedFilters" :options="filterStatesOptions" label="Examples" :style="{width: '300px'}" />
    </div>
    <div :class="$style.block">
      <div v-if="enableDnd" :class="$style.leftColumn">
        <div
          v-for="option in options"
          :key="option.id"
          :draggable="enableDnd ? 'true' : undefined"
          :class="$style.columnChip"
          @dragstart="(e) => e?.dataTransfer?.setData('text/plain', option.id)"
        >
          {{ option.label }}
        </div>
      </div>
      <div :key="selectedSavedFilters" :class="$style.rightColumn" >
        <PlAdvancedFilter
          v-model="filtersModel"
          :items="options"
          :enable-dnd="enableDnd"
          :get-suggest-options="getSuggestOptions"
          :get-suggest-model="getSuggestModel"
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
