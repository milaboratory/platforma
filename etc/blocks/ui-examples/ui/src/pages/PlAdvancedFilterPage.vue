<script setup lang="ts">
import type { FilterUi, PColumnSpec, SUniversalPColumnId } from '@platforma-sdk/model';
import { PlAdvancedFilter, PlBlockPage, PlCheckbox, PlDropdown } from '@platforma-sdk/ui-vue';
import { computed, ref, watch } from 'vue';

const columnsIdList = ['1', '2', '3'];
const info: Record<string, { error: boolean; label: string; spec: PColumnSpec }> = {
  1: { error: false, label: 'Column 1', spec: { kind: 'PColumn' as const, valueType: 'Int' as const, name: 'c1', axesSpec: [] } },
  2: { error: false, label: 'Column 2', spec: { kind: 'PColumn' as const, valueType: 'String' as const, name: 'c2', axesSpec: [] } },
  3: { error: false, label: 'Column 3', spec: { kind: 'PColumn' as const, valueType: 'Double' as const, name: 'c3', axesSpec: [] } },
};
const uniqueValues = {
  1: [{ value: 1, label: 'v1' }, { value: 2, label: 'v2' }, { value: 3, label: 'v3' }],
  2: [{ value: '21', label: 'v21' }, { value: '22', label: 'v22' }],
  3: [{ value: '31', label: 'v31' }, { value: '32', label: 'v32' }, { value: '33', label: 'v33' }],
};
const dndMode = ref(false);
const draggedId = ref<string | undefined>();

async function searchOptions() {
  return [];
}
async function searchModel(id: string, modelStr: string) {
  return { value: modelStr, label: `Label ${modelStr}` };
}

const errorState = {
  type: 'and' as const,
  filters: [
    {
      type: 'and' as const,
      filters: [
        {
          type: 'patternEquals' as const,
          column: 'someColumn' as SUniversalPColumnId,
          value: 'A',
        },
        {
          type: 'or' as const,
          filters: [
            {
              type: 'patternEquals' as const,
              column: 'someColumn' as SUniversalPColumnId,
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
          column: 'someColumn' as SUniversalPColumnId,
        },
        {
          type: 'isNotNA' as const,
          column: 'someColumn' as SUniversalPColumnId,
        },
      ],
    }, {
      type: 'and' as const,
      filters: [
        {
          type: 'patternContainSubsequence' as const,
          column: 'someColumn' as SUniversalPColumnId,
          value: 'someString',
        },
      ],
    }],
};

const normalState: FilterUi = {
  type: 'and' as const,
  filters: [
    {
      type: 'or' as const,
      filters: [{
        type: 'isNA' as const,
        column: '1' as SUniversalPColumnId,
      }, {
        type: 'numberEquals' as const,
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

const filterStates: Record<string, FilterUi> = {
  normalState: normalState,
  errorState: errorState,
  emptyState: {
    type: 'and',
    filters: [],
  },
};

const filtersModel = computed<FilterUi>({
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
  <PlBlockPage style="max-width: 100%">
    <div :class="$style.controls">
      <PlCheckbox v-model="dndMode" >Drag-n-Drop mode</PlCheckbox>
      <PlDropdown v-model="selectedSavedFilters" :options="filterStatesOptions" label="Examples" :style="{width: '300px'}" />
    </div>
    <div :class="$style.block">
      <div v-if="dndMode" class="d-flex flex-column gap-16" :class="$style.leftColumn">
        <div
          v-for="id in columnsIdList"
          :key="id"
          :draggable="dndMode ? 'true' : undefined"
          :class="$style.columnChip"
          @dragstart="() => draggedId = id"
          @dragend="() => draggedId = undefined"
        >
          {{ info[id].label }}
        </div>
      </div>
      <div :key="selectedSavedFilters" class="d-flex flex-column gap-16" :class="$style.rightColumn" >
        <PlAdvancedFilter
          v-model="filtersModel"
          :source-info-by-source-id="info"
          :unique-values-by-source-id="uniqueValues"
          :source-ids="columnsIdList"
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
  width: 280px;
  padding: 10px;
  margin: 10px;
  border: 1px solid grey;
}
.rightColumn {
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
