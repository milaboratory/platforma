<script lang="ts" setup>
import { PlBtnSecondary, PlCheckbox, PlElementList, PlIcon16 } from '@milaboratories/uikit';
import type { ListOptionBase } from '@platforma-sdk/model';
import { computed, toRaw } from 'vue';
import FilterEditor from './FilterEditor.vue';
import OperandButton from './OperandButton.vue';
import { DEFAULT_FILTER_TYPE, DEFAULT_FILTERS, SUPPORTED_FILTER_TYPES } from './constants';
import type { CommonFilter, EditableFilter, NodeFilter, PlAdvancedFilterColumnId, RootFilter, SourceOptionInfo } from './types';
import { createNewGroup, getNewId, isValidColumnId } from './utils';

const model = defineModel<RootFilter>('filters', { required: true });

const props = withDefaults(defineProps<{
  /** List of ids of sources (columns, axes) that can be selected in filters */
  items: SourceOptionInfo[];
  /** List of supported filter types */
  supportedFilters?: typeof SUPPORTED_FILTER_TYPES;
  /** If true - new filter can be added by droppind element into filter group; else new column is added by button click */
  enableDnd?: boolean;
  /** If true - "Add group" button is shown below the filter groups */
  enableAddGroupButton?: boolean;
  /** Loading function for unique values for Equal/InSet filters and fixed axes options. */
  getSuggestOptions: (params: { columnId: PlAdvancedFilterColumnId; searchStr: string; axisIdx?: number }) =>
  ListOptionBase<string | number>[] | Promise<ListOptionBase<string | number>[]>;
  /** Loading function for label of selected value for Equal/InSet filters and fixed axes options. */
  getSuggestModel?: (params: { columnId: PlAdvancedFilterColumnId; searchStr: string; axisIdx?: number }) =>
    ListOptionBase<string | number> | Promise<ListOptionBase<string | number>>;
}>(), {
  supportedFilters: () => SUPPORTED_FILTER_TYPES,
  getSuggestModel: undefined,

  enableDnd: false,
  enableAddGroupButton: false,
});

const firstColumnId = computed(() => props.items[0]?.id);
const emptyGroup: NodeFilter[] = [{
  id: -1,
  type: 'and',
  filters: [],
  isExpanded: true,
}];

function getRootGroups() {
  if (model.value.type !== 'or' && model.value.type !== 'and') {
    throw new Error('Invalid model structure, expected root to be "or" or "and" group');
  }
  return model.value.filters;
}

function getRootGroup(idx: number): NodeFilter {
  const groups = getRootGroups();
  const group = groups[idx];
  if (group.type !== 'and' && group.type !== 'or' && group.type !== 'not') {
    throw new Error('Invalid group structure, expected "and", "or" or "not" group');
  }
  return group;
}

function getRootGroupContent(idx: number): Exclude<NodeFilter, { type: 'not' }> {
  const group = getRootGroup(idx);

  if (group.type !== 'not') {
    return group;
  }

  if (group.filter.type !== 'and' && group.filter.type !== 'or') {
    throw new Error('Invalid group structure, expected "and" or "or" group inside "not"');
  }

  return group.filter;
}

function addColumnToGroup(groupIdx: number, selectedSourceId: PlAdvancedFilterColumnId) {
  const group = getRootGroupContent(groupIdx);

  group.filters.push({
    ...DEFAULT_FILTERS[DEFAULT_FILTER_TYPE],
    column: selectedSourceId,
    id: getNewId(),
    isExpanded: true,
  } as CommonFilter);
}

function removeFilterFromGroup(groupIdx: number, filterIdx: number) {
  const group = getRootGroupContent(groupIdx);

  if (group.filters.length === 1 && filterIdx === 0) {
    removeGroup(groupIdx);
  } else {
    group.filters.splice(filterIdx, 1);
  }
}
function inverseRootNode(groupIdx: number) {
  const groups = getRootGroups();
  const group = groups[groupIdx];
  if (group.type === 'not') {
    if (group.filter.type !== 'and' && group.filter.type !== 'or') {
      throw new Error('Invalid group structure, expected "and" or "or" group inside "not"');
    }
    groups[groupIdx] = group.filter;
  } else {
    const type = groups[groupIdx].type;
    if (type !== 'and' && type !== 'or' && type !== 'not') {
      throw new Error('Invalid group structure, expected "and", "or" or "not" group');
    }

    groups[groupIdx] = {
      id: getNewId(),
      isExpanded: true,
      type: 'not',
      filter: groups[groupIdx],
    };
  }
}

function getNotContent<T extends CommonFilter>(item: T): Exclude<T, { type: 'not' }> {
  return item.type === 'not' ? item.filter as Exclude<T, { type: 'not' }> : item as Exclude<T, { type: 'not' }>;
}

function removeGroup(groupIdx: number) {
  const groups = getRootGroups();
  groups.splice(groupIdx, 1);
}
function addGroup(selectedSourceId: PlAdvancedFilterColumnId) {
  const newGroup = createNewGroup(selectedSourceId);
  const groups = getRootGroups();
  groups.push(newGroup);
}

function handleDropToExistingGroup(groupIdx: number, event: DragEvent) {
  const dataTransfer = event.dataTransfer;
  if (dataTransfer?.getData('text/plain')) {
    const draggedId = dataTransfer.getData('text/plain');
    if (isValidColumnId(draggedId)) {
      addColumnToGroup(groupIdx, draggedId);
    }
  }
}
function handleDropToNewGroup(event: DragEvent) {
  const dataTransfer = event.dataTransfer;
  if (dataTransfer?.getData('text/plain')) {
    const draggedId = dataTransfer.getData('text/plain');
    if (isValidColumnId(draggedId)) {
      addGroup(draggedId);
    }
  }
}
function dragOver(event: DragEvent) {
  event.preventDefault();
}

function validateFilter<T extends CommonFilter>(item: T): EditableFilter {
  if (item.type === 'and' || item.type === 'or' || item.type === 'not') {
    throw new Error('Invalid filter structure, expected leaf filter');
  }

  return item as EditableFilter;
}

function updateFilter(filters: CommonFilter[], idx: number, updatedFilter: EditableFilter) {
  filters[idx] = toRaw(updatedFilter as CommonFilter);
}
</script>
<template>
  <div>
    <PlElementList
      v-model:items="model.filters"
      :get-item-key="(filter) => filter.id"

      :item-class="$style.filterGroup"
      :item-class-content="$style.filterGroupContent"
      :item-class-title="$style.filterGroupTitle"

      :is-expanded="(filter) => filter.isExpanded === true"
      :on-expand="(group) => { group.isExpanded = !group.isExpanded}"

      :disableDragging="false"
      :disableRemoving="false"
      :disableToggling="true"
      :disablePinning="true"
    >
      <template #item-title>
        Filter group
      </template>
      <template #item-content="{ item, index }">
        <div
          :class="$style.groupContent"
          dropzone="true"
          @drop="(event) => handleDropToExistingGroup(index, event)"
          @dragover="dragOver"
        >
          <PlCheckbox :model-value="item.type === 'not'" :class="$style.notCheckbox" @update:model-value="inverseRootNode(index)">NOT</PlCheckbox>
          <template v-for="(_, filterIdx) in getNotContent(item).filters" :key="filterIdx">
            <FilterEditor
              :filter="validateFilter(getNotContent(item).filters[filterIdx])"
              :operand="getNotContent(item).type"
              :column-options="items"
              :supported-filters="props.supportedFilters"
              :get-suggest-model="props.getSuggestModel"
              :get-suggest-options="props.getSuggestOptions"
              :enable-dnd="Boolean(props.enableDnd)"
              :is-last="filterIdx === getNotContent(item).filters.length - 1"
              :on-change-operand="(v) => getNotContent(item).type = v"
              :on-delete="() => removeFilterFromGroup(index, filterIdx)"
              @update:filter="(value) => updateFilter(getNotContent(item).filters, filterIdx, value)"
            />
          </template>
          <div v-if="props.enableDnd" :class="$style.dropzone">
            <div>Drop dimensions here</div>
          </div>
          <PlBtnSecondary v-else @click="addColumnToGroup(index, firstColumnId)">
            <PlIcon16 name="add" style="margin-right: 8px"/>
            Add column
          </PlBtnSecondary>
        </div>
      </template>
      <template #item-after="{ index }">
        <OperandButton
          :class="$style.buttonWrapper"
          :active="model.type"
          :disabled="index === getRootGroups().length - 1"
          :on-select="(v) => model.type = v"
        />
      </template>
    </PlElementList>

    <!-- Last group - always exists, always empty, just for adding new groups -->
    <PlElementList
      v-if="props.enableAddGroupButton"
      :items="emptyGroup"
      :get-item-key="(group) => group.id"
      :item-class="$style.filterGroup"
      :item-class-content="$style.filterGroupContent"
      :item-class-title="$style.filterGroupTitle"

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
      <template #item-content>
        <div v-if="enableDnd" :class="$style.dropzone">
          <div>Drop dimensions here</div>
        </div>
        <PlBtnSecondary v-else @click="addGroup(firstColumnId)">
          <PlIcon16 name="add" style="margin-right: 8px"/>Add column
        </PlBtnSecondary>
      </template>
    </PlElementList>
  </div>
</template>
<style module>
  .filterGroup {
    background: var(--bg-base-light);
  }
  .filterGroup:hover {
    background: rgba(99, 224, 36, 0.12);
  }
  .filterGroupTitle {
    background: none;
  }
  .filterGroupContent {
    padding: 4px 24px 24px 24px;
  }
  .groupContent {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .notCheckbox {
    margin: 4px 0;
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
  .buttonWrapper {
    margin-top: 8px;
    height: 56px;
    display: flex;
    align-items: center;
  }
  :global(.sortable-chosen) .buttonWrapper {
    visibility: hidden;
  }
</style>
