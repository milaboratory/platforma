<script lang="ts" setup>
import FilterComponent from './Filter.vue';
import { PlBtnSecondary, PlElementList, PlCheckbox, PlIcon16 } from '@milaboratories/uikit';
import type { PlAdvancedFilterUI, SourceOptionsInfo, UniqueValuesInfo } from './types';
import { computed, reactive, ref, watch } from 'vue';
import OperandButton from './OperandButton.vue';
import { DEFAULT_FILTER_TYPE, DEFAULT_FILTERS } from './constants';
import type { FilterUi, ListOptionBase } from '@platforma-sdk/model';
import { createNewGroup, toInnerModel, toOuterModel } from './utils';

const props = withDefaults(defineProps<{
  /** List of ids of sources (columns, axes) that can be selected in filters */
  sourceIds: string[];
  /** If true - new filter can be added by droppind element into filter group; else new column is added by button click */
  dndMode?: boolean;
  /** If dnd mode on - used for column adding */
  draggedId?: string;
  /** Contains info about every source id to render: type (string/int...), label, error */
  sourceInfoBySourceId: SourceOptionsInfo;
  /** List of unique values of source (column, axis) for Equal/InSet filters.
   * If sourceId missed here values PlAutocomplete component used */
  uniqueValuesBySourceId: UniqueValuesInfo;
  /** Loading function for unique values for Equal/InSet filters. Used if there are not ready list of unique values in uniqueValuesBySourceId */
  searchOptions: (id: string, str: string) => Promise<ListOptionBase<string | number>[]>;
  /** Loading function for label of selected value for Equal/InSet filters. Used if there are not ready list of unique values in uniqueValuesBySourceId */
  searchModel: (id: string, str: string) => Promise<ListOptionBase<string | number>>;
}>(), {
  dndMode: false,
  draggedId: undefined,
});

const model = defineModel<FilterUi>({ required: true });

const innerModel = ref<PlAdvancedFilterUI>(toInnerModel(model.value));
function updateOuterModelValue(v: PlAdvancedFilterUI) {
  model.value = toOuterModel(v);
}
watch(() => innerModel.value, (v: PlAdvancedFilterUI) => {
  updateOuterModelValue(v);
}, { deep: true });

const defaultColumnId = computed(() => props.sourceIds[0]);
const emptyGroup = [{
  id: 'empty',
  not: false,
  operand: 'and',
  filters: [],
}];

const expanded = reactive<Record<string, boolean>>(innerModel.value.groups.reduce((res, group) => {
  res[group.id] = true;
  return res;
}, {} as Record<string, boolean>));

function addColumnToGroup(groupIdx: number, selectedSourceId: string) {
  innerModel.value.groups[groupIdx].filters.push({
    ...DEFAULT_FILTERS[DEFAULT_FILTER_TYPE],
    sourceId: selectedSourceId,
  });
}

function removeFilterFromGroup(groupIdx: number, filterIdx: number) {
  if (innerModel.value.groups[groupIdx].filters.length === 1 && filterIdx === 0) {
    removeGroup(groupIdx);
  } else {
    innerModel.value.groups[groupIdx].filters = innerModel.value.groups[groupIdx].filters.filter((_v, idx) => idx !== filterIdx);
  }
}

function removeGroup(groupIdx: number) {
  innerModel.value.groups = innerModel.value.groups.filter((v, idx) => idx !== groupIdx);
}
function addGroup(selectedSourceId: string) {
  const newGroup = createNewGroup(selectedSourceId);
  expanded[newGroup.id] = true;
  innerModel.value.groups.push(newGroup);
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
function dragOver(event: DragEvent) {
  event.preventDefault();
}
</script>
<template>
  <div>
    <PlElementList
      v-model:items="innerModel.groups"
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
      <template #item-title>
        Filter group
      </template>
      <template #item-content="{ item, index }">
        <div
          :class="$style.groupContent" dropzone="true"
          @drop="() => handleDropToExistingGroup(index)"
          @dragover="dragOver"
        >
          <PlCheckbox v-model="item.not">NOT</PlCheckbox>
          <FilterComponent
            v-for="filterIdx of new Array(item.filters.length).fill(0).map((_v, idx)=> idx)"
            :key="filterIdx"
            v-model="item.filters[filterIdx]"
            :operand="item.operand"
            :source-info-by-source-id="sourceInfoBySourceId"
            :unique-values-by-source-id="uniqueValuesBySourceId"
            :source-ids="sourceIds"
            :search-model="searchModel"
            :search-options="searchOptions"
            :dnd-mode="dndMode"
            :last="filterIdx === item.filters.length - 1"
            @change-operand="(v) => item.operand = v"
            @delete="() => removeFilterFromGroup(index, filterIdx)"
          />
          <div v-if="dndMode" :class="$style.dropzone">
            <div>Drop dimensions here</div>
          </div>
          <PlBtnSecondary v-else @click="addColumnToGroup(index, defaultColumnId)">
            <PlIcon16 name="add" style="margin-right: 8px"/>Add column
          </PlBtnSecondary>
        </div>
      </template>
      <template #item-after="{ index }">
        <div :class="$style.button_wrapper">
          <OperandButton
            :active="innerModel.operand"
            :disabled="index === innerModel.groups.length - 1"
            @select="(v) => innerModel.operand = v"
          />
        </div>
      </template>
    </PlElementList>

    <!-- Last group - always exists, always empty, just for adding new groups -->
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
    border: 1.5px dashed var(--color-div-grey);
    color: var(--txt-03);
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
