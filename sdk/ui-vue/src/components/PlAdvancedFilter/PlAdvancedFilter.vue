<script lang="ts" setup generic="T extends RootFilter">
import { PlBtnSecondary, PlCheckbox, PlElementList } from "@milaboratories/uikit";
import type { ListOptionBase } from "@platforma-sdk/model";
import { produce } from "immer";
import { computed } from "vue";
import FilterEditor from "./FilterEditor.vue";
import OperandButton from "./OperandButton.vue";
import { DEFAULT_FILTER_TYPE, DEFAULT_FILTERS, SUPPORTED_FILTER_TYPES } from "./constants";
import type {
  CommonFilter,
  EditableFilter,
  NodeFilter,
  Operand,
  PlAdvancedFilterColumnId,
  RootFilter,
  SourceOptionInfo,
} from "./types";
import { createNewGroup, getNewId, isValidColumnId } from "./utils";

const props = withDefaults(
  defineProps<{
    filters: T;
    onUpdateFilters: (filters: T) => void;
    /** List of ids of sources (columns, axes) that can be selected in filters */
    options: SourceOptionInfo[];
    /** List of supported filter types */
    supportedFilters?: typeof SUPPORTED_FILTER_TYPES;
    /** If true - new filter can be added by droppind element into filter group; else new column is added by button click */
    enableDnd?: boolean;
    /** If true - "Add group" button is shown below the filter groups */
    enableAddGroupButton?: boolean;
    /** If true - eye icon is shown per group to toggle suppression */
    enableToggling?: boolean;
    /** Function to determine if a filter is pinned */
    isPinned?: (item: NodeFilter, index: number) => boolean;
    /** Function to determine if a filter is removable */
    isRemovable?: (item: NodeFilter, index: number) => boolean;
    /** Function to determine if a filter is draggable */
    isDraggable?: (item: NodeFilter, index: number) => boolean;
    /** Function to determine if a group is complete */
    isCompletedGroup?: (group: NodeFilter, index: number) => boolean;
    /** Loading function for unique values for Equal/InSet filters and fixed axes options. */
    getSuggestOptions: (params: {
      columnId: PlAdvancedFilterColumnId;
      axisIdx?: number;
      searchStr: string;
      searchType: "value" | "label";
    }) => ListOptionBase<string | number>[] | Promise<ListOptionBase<string | number>[]>;
  }>(),
  {
    supportedFilters: () => SUPPORTED_FILTER_TYPES,
    isCompletedGroup: () => false,
    isPinned: () => false,
    isRemovable: () => true,
    isDraggable: () => true,

    getSuggestModel: undefined,

    enableDnd: false,
    enableAddGroupButton: false,
    enableToggling: false,
  },
);
const produceFiltersUpdate = (updater: (draft: T) => void) => {
  props.onUpdateFilters(produce(props.filters, updater));
};

const firstColumnId = computed(() => props.options[0]?.id);
const emptyGroup: NodeFilter[] = [
  {
    id: -1,
    type: "and",
    filters: [],
    isExpanded: true,
  },
];

const rootFilters = computed({
  get: () => props.filters.filters,
  set: (filters) => props.onUpdateFilters({ ...props.filters, filters: filters }),
});

function getRootGroups() {
  if (props.filters.type !== "or" && props.filters.type !== "and") {
    throw new Error('Invalid model structure, expected root to be "or" or "and" group');
  }
  return props.filters.filters;
}

function getDraftGroupContent(
  draft: RootFilter,
  idx: number,
): Exclude<NodeFilter, { type: "not" }> {
  const group = draft.filters[idx];
  if (group.type === "not") {
    if (group.filter.type !== "and" && group.filter.type !== "or") {
      throw new Error('Invalid group structure, expected "and" or "or" group inside "not"');
    }
    return group.filter;
  }
  if (group.type !== "and" && group.type !== "or") {
    throw new Error('Invalid group structure, expected "and", "or" or "not" group');
  }
  return group;
}

function getNotContent<T extends CommonFilter>(item: T): Exclude<T, { type: "not" }> {
  return item.type === "not"
    ? (item.filter as Exclude<T, { type: "not" }>)
    : (item as Exclude<T, { type: "not" }>);
}

function addColumnToGroup(groupIdx: number, selectedSourceId: PlAdvancedFilterColumnId) {
  produceFiltersUpdate((draft: RootFilter) => {
    const group = getDraftGroupContent(draft, groupIdx);
    group.filters.push({
      ...DEFAULT_FILTERS[DEFAULT_FILTER_TYPE],
      column: selectedSourceId,
      id: getNewId(),
      isExpanded: true,
    } as CommonFilter);
  });
}

function removeFilterFromGroup(groupIdx: number, filterIdx: number) {
  produceFiltersUpdate((draft: RootFilter) => {
    const group = getDraftGroupContent(draft, groupIdx);
    if (group.filters.length === 1 && filterIdx === 0) {
      draft.filters.splice(groupIdx, 1);
    } else {
      group.filters.splice(filterIdx, 1);
    }
  });
}

function inverseRootNode(groupIdx: number) {
  produceFiltersUpdate((draft: RootFilter) => {
    const group = draft.filters[groupIdx];
    if (group.type === "not") {
      if (group.filter.type !== "and" && group.filter.type !== "or") {
        throw new Error('Invalid group structure, expected "and" or "or" group inside "not"');
      }
      draft.filters[groupIdx] = {
        ...draft.filters[groupIdx],
        ...group.filter,
      };
    } else {
      const type = draft.filters[groupIdx].type;
      if (type !== "and" && type !== "or" && type !== "not") {
        throw new Error('Invalid group structure, expected "and", "or" or "not" group');
      }
      draft.filters[groupIdx] = {
        ...draft.filters[groupIdx],
        id: getNewId(),
        type: "not",
        filter: draft.filters[groupIdx],
      };
    }
  });
}

function addGroup(selectedSourceId: PlAdvancedFilterColumnId) {
  produceFiltersUpdate((draft: RootFilter) => {
    draft.filters.push(createNewGroup(selectedSourceId));
  });
}

function updateFilter(groupIdx: number, filterIdx: number, updatedFilter: EditableFilter) {
  produceFiltersUpdate((draft: RootFilter) => {
    getDraftGroupContent(draft, groupIdx).filters[filterIdx] = updatedFilter as CommonFilter;
  });
}

function handleDropToExistingGroup(groupIdx: number, event: DragEvent) {
  const dataTransfer = event.dataTransfer;
  if (dataTransfer?.getData("text/plain")) {
    const draggedId = dataTransfer.getData("text/plain");
    if (isValidColumnId(draggedId)) {
      addColumnToGroup(groupIdx, draggedId);
    }
  }
}

function handleDropToNewGroup(event: DragEvent) {
  const dataTransfer = event.dataTransfer;
  if (dataTransfer?.getData("text/plain")) {
    const draggedId = dataTransfer.getData("text/plain");
    if (isValidColumnId(draggedId)) {
      addGroup(draggedId);
    }
  }
}

function dragOver(event: DragEvent) {
  event.preventDefault();
}

function toggleExpand(_: NodeFilter, index: number) {
  produceFiltersUpdate((draft: RootFilter) => {
    draft.filters[index].isExpanded = !draft.filters[index].isExpanded;
  });
}

function toggleSuppress(_: NodeFilter, index: number) {
  produceFiltersUpdate((draft: RootFilter) => {
    draft.filters[index].isSuppressed = !draft.filters[index].isSuppressed;
  });
}

function changeGroupOperand(index: number, v: Operand) {
  produceFiltersUpdate((draft: RootFilter) => {
    getDraftGroupContent(draft, index).type = v;
  });
}

function changeRootOperand(v: Operand) {
  produceFiltersUpdate((draft: RootFilter) => {
    draft.type = v;
  });
}

function validateFilter<T extends CommonFilter>(item: T): EditableFilter {
  if (item.type === "and" || item.type === "or" || item.type === "not") {
    throw new Error("Invalid filter structure, expected leaf filter");
  }

  return item as EditableFilter;
}
</script>
<template>
  <div>
    <PlElementList
      v-model:items="rootFilters"
      :get-item-key="(filter) => filter.id"
      :item-class="$style.filterGroup"
      :item-class-content="$style.filterGroupContent"
      :item-class-title="$style.filterGroupTitle"
      :is-expanded="(filter) => filter.isExpanded === true"
      :on-expand="toggleExpand"
      :is-toggled="(item) => item.isSuppressed === true"
      :on-toggle="toggleSuppress"
      :is-pinned="(item, index) => props.isPinned?.(item, index) === true"
      :is-pinnable="() => false"
      :is-removable="(item, index) => props.isRemovable?.(item, index) === true"
      :is-draggable="(item, index) => props.isDraggable?.(item, index) === true"
      :disable-toggling="props.enableToggling !== true"
      :disable-dragging="false"
      :disable-removing="false"
    >
      <template #item-title="{ item, index }">
        <slot name="group-title" :item="item" :index="index">Filter group</slot>
      </template>
      <template #item-content="{ item, index }">
        <div
          :class="[
            $style.groupContent,
            {
              [$style.suppressedLabel]: item.isSuppressed,
            },
          ]"
          dropzone="true"
          @drop="(event) => handleDropToExistingGroup(index, event)"
          @dragover="dragOver"
        >
          <PlCheckbox
            :model-value="item.type === 'not'"
            :class="$style.notCheckbox"
            @update:model-value="inverseRootNode(index)"
          >
            Filter Out
          </PlCheckbox>
          <template v-for="(_, filterIdx) in getNotContent(item).filters" :key="filterIdx">
            <FilterEditor
              :filter="validateFilter(getNotContent(item).filters[filterIdx])"
              :operand="getNotContent(item).type"
              :column-options="options"
              :supported-filters="props.supportedFilters"
              :get-suggest-options="props.getSuggestOptions"
              :enable-dnd="Boolean(props.enableDnd)"
              :is-last="filterIdx === getNotContent(item).filters.length - 1"
              @delete="() => removeFilterFromGroup(index, filterIdx)"
              @update-filter="(value) => updateFilter(index, filterIdx, value)"
              @change-operand="(v) => changeGroupOperand(index, v)"
            />
          </template>
          <div v-if="props.enableDnd" :class="$style.dropzone">
            <div>Drop dimensions here</div>
          </div>
          <PlBtnSecondary
            v-else-if="!props.isCompletedGroup(item, index)"
            icon="add"
            @click="addColumnToGroup(index, firstColumnId)"
          >
            Add filter
          </PlBtnSecondary>
        </div>
      </template>
      <template #item-after="{ index }">
        <OperandButton
          v-if="props.enableAddGroupButton || index < getRootGroups().length - 1"
          :class="$style.buttonWrapper"
          :active="props.filters.type"
          :disabled="index === getRootGroups().length - 1"
          :on-select="changeRootOperand"
        />
      </template>
    </PlElementList>

    <!-- Last group - always empty, just for adding new groups -->
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
      <template #item-title="{ item, index }">
        <slot name="group-title" :item="item" :index="index + getRootGroups().length"
          >Filter group</slot
        >
      </template>
      <template #item-content>
        <div v-if="enableDnd" :class="$style.dropzone">
          <div>Drop dimensions here</div>
        </div>
        <slot v-else name="add-group-buttons">
          <PlBtnSecondary icon="add" @click="addGroup(firstColumnId)"> Add filter </PlBtnSecondary>
        </slot>
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
.suppressedLabel {
  filter: grayscale(100%);
  pointer-events: none;
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
