<script lang="ts" setup>
import FilterComponent from './Filter.vue';
import { PlBtnSecondary, PlElementList, PlCheckbox, PlIcon16 } from '@milaboratories/uikit';
import type { ComplexFilter, SourceOptionsInfo } from './types';
import { computed, reactive, ref } from 'vue';
import OperandButton from './OperandButton.vue';
import { DEFAULT_FILTERS, FILTER_TYPE_OPTIONS } from './constants';

const props = withDefaults(defineProps<{
  info: SourceOptionsInfo;
  sourceIds: string[];
  draggedId?: string;
  dndMode?: boolean;
}>(), {
  dndMode: false,
  draggedId: undefined,
});

let groupIdCounter = 0;
function getNewGroupId() {
  groupIdCounter++;
  return String(groupIdCounter);
}

const innerTestModel = ref<ComplexFilter>({
  groups: [
    {
      id: getNewGroupId(),
      not: false,
      operand: 'and',
      childIdxs: [0, 1],
      filters: [
        {
          type: 'Equal',
          sourceId: 'someColumn',
          reference: 'A',
        },
        {
          type: 'InSet',
          sourceId: 'someColumn',
          reference: ['A'],
        },
      ],
    },
    {
      id: getNewGroupId(),
      not: false,
      operand: 'and',
      childIdxs: [0, 1],
      filters: [
        {
          type: 'IsNA',
          sourceId: 'someColumn',
        },
        {
          type: 'IsNotNA',
          sourceId: 'someColumn',
        },
      ],
    },
    {
      id: getNewGroupId(),
      not: false,
      operand: 'and',
      childIdxs: [0, 1],
      filters: [
        {
          type: 'StringContains',
          sourceId: 'someColumn',
          substring: 'someString',
        },
      ],
    },
  ],
  operand: 'or',
});

const defaultColumnId = computed(() => props.sourceIds[0]);
const emptyGroup = [{
  id: 'empty',
  not: false,
  operand: 'and',
  childIdxs: [],
  filters: [],
}];

const expanded = reactive<Record<string, boolean>>(innerTestModel.value.groups.reduce((res, group) => {
  res[group.id] = true;
  return res;
}, {} as Record<string, boolean>));

function addColumnToGroup(groupIdx: number, selectedSourceId: string) {
  innerTestModel.value.groups[groupIdx].filters.push({
    ...DEFAULT_FILTERS[FILTER_TYPE_OPTIONS[0].value],
    sourceId: selectedSourceId,
  });
}

function removeFilterFromGroup(groupIdx: number, filterIdx: number) {
  if (innerTestModel.value.groups[groupIdx].filters.length === 1 && filterIdx === 0) {
    removeGroup(groupIdx);
  } else {
    innerTestModel.value.groups[groupIdx].filters = innerTestModel.value.groups[groupIdx].filters.filter((v, idx) => idx !== filterIdx);
  }
}

function removeGroup(groupIdx: number) {
  innerTestModel.value.groups = innerTestModel.value.groups.filter((v, idx) => idx !== groupIdx);
}
function addGroup(selectedSourceId: string) {
  const newGroup = {
    id: getNewGroupId(),
    not: false,
    operand: 'and' as const,
    childIdxs: [0],
    filters: [{
      ...DEFAULT_FILTERS[FILTER_TYPE_OPTIONS[0].value],
      sourceId: selectedSourceId,
    }],
  };
  expanded[newGroup.id] = true;
  innerTestModel.value.groups.push(newGroup);
}

function handleDropToExistingGroup(groupIdx: number) {
  if (props.draggedId) {
    addColumnToGroup(groupIdx, props.draggedId);
  }
}
function handleDropToNewGroup() {
  if (props.draggedId) {
    addGroup(props.draggedId);
  }
}
function dragEnter(event: DragEvent) {
  event.preventDefault();
}
function dragOver(event: DragEvent) {
  event.preventDefault();
}
</script>
<template>
  <div>
    <PlElementList
      v-model:items="innerTestModel.groups"
      :get-item-key="(group) => group.id"

      :item-class="$style.filterGroup"
      :item-class-body="$style.filterGroup__body"
      :item-class-head="$style.filterGroup__head"

      :is-expanded="(group) => expanded[group.id] ?? false"
      :is-expandable="() => true"
      :is-removable="() => true"

      :disableDragging="false"
      :disableRemoving="false"
      :disableToggling="true"
      :disablePinning="true"

      @expand="(group) => {expanded[group.id] = !expanded[group.id]}"
    >
      <template #item-title="{ item }">
        Filter group {{ item.id }}
      </template>
      <template #item-content="{ item, index }">
        <div :class="$style.groupContent">
          <PlCheckbox v-model="item.not">NOT</PlCheckbox>
          <FilterComponent
            v-for="filterIdx of new Array(item.filters.length).fill(0).map((_v, idx)=> idx)"
            :key="filterIdx"
            v-model="item.filters[filterIdx]"
            :operand="item.operand"
            :info="info"
            :source-ids="sourceIds"
            :preloadedOptions="[{value: 'someColumn', label: 'Label'}, {value: 'someColumn2', label: 'Label2'}]"
            :search-model="async () => ({value: 'someColumn', label: 'Label'})"
            :search-options="async () => [{value: 'someColumn', label: 'Label'}]"
            :dnd-mode="dndMode"
            @change-operand="(v) => item.operand = v"
            @delete="() => removeFilterFromGroup(index, filterIdx)"
          />
          <div
            v-if="dndMode"
            :class="$style.dropzone"
            dropzone="true"
            @drop="() => handleDropToExistingGroup(index)"
            @dragenter="dragEnter"
            @dragover="dragOver"
          >
            <div>Drop dimensions here</div>
          </div>
          <PlBtnSecondary v-else @click="addColumnToGroup(index, defaultColumnId)">
            <PlIcon16 name="add" style="margin-right: 8px"/>Add column
          </PlBtnSecondary>
        </div>
      </template>
      <template #item-after>
        <div :class="$style.button_wrapper">
          <OperandButton
            :active="innerTestModel.operand"
            :disabled="false"
            @select="(v) => innerTestModel.operand = v"
          />
        </div>
      </template>
    </PlElementList>

    <!-- Last group - aleays exists, always empty, for adding new groups -->
    <PlElementList
      v-model:items="emptyGroup"
      :get-item-key="(group) => group.id"
      :item-class="$style.filterGroup"
      :item-class-body="$style.filterGroup__body"
      :item-class-head="$style.filterGroup__head"

      :is-expanded="() => true"

      :disableDragging="true"
      :disableRemoving="true"
      :disableToggling="true"
      :disablePinning="true"
      dropzone="true"
      @drop="handleDropToNewGroup"
      @dragenter="dragEnter"
      @dragover="dragOver"
    >
      <template #item-title>Filter group</template>
      <template #item-content="{item}">
        <PlCheckbox v-model="item.not" disabled >NOT</PlCheckbox>
        <div v-if="dndMode" :class="$style.dropzone">
          <div>Drop dimensions here</div>
        </div>
        <PlBtnSecondary v-else @click="addGroup(defaultColumnId)">
          <PlIcon16 name="add" style="margin-right: 8px"/>Add column
        </PlBtnSecondary>
      </template>
    </PlElementList>
  </div>
</template>
<style lang="scss" module>
  .filterGroup {
    margin-bottom: 72px;
    overflow: visible;
    background: var(--bg-base-light);

    &:hover {
      background: rgba(99, 224, 36, 0.12);
    }

    &__body {
      background: none;
      padding: 8px 12px;
    }
    &__head {
      background: none;
    }
  }

  .groupContent {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .dropzone {
    border-radius: 6px;
    border: 1.5px dashed #E1E3EB;
    color: #9D9EAE;
    font-family: Manrope;
    font-size: 14px;
    font-style: normal;
    font-weight: 500;
    height: 40px;
    cursor: default;
    display: flex;
    justify-content: center;
    align-items: center;
  }
  .button_wrapper {
    height: 0;
    transform: translateY(25px);
  }
  :global(.sortable-chosen) .button_wrapper{
    visibility: hidden;
  }
</style>
