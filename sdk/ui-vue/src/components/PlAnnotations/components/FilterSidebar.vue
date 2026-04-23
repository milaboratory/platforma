<script lang="ts">
export type Props = {
  columns: PlAdvancedFilterItem[];

  getSuggestOptions: (params: {
    columnId: PlAdvancedFilterColumnId;
    axisIdx?: number;
    searchStr: string;
    searchType: "value" | "label";
  }) => ListOptionBase<string | number>[] | Promise<ListOptionBase<string | number>[]>;

  hasSelectedColumns?: boolean;
  getValuesForSelectedColumns?: () => Promise<
    undefined | { columnId: PObjectId; values: string[] }
  >;
};
</script>
<script setup lang="ts">
import { computed } from "vue";
import { produce } from "immer";
import { randomInt } from "@milaboratories/helpers";
import { PlBtnSecondary, PlEditableTitle, PlSidebarItem } from "@milaboratories/uikit";
import type { ListOptionBase, PObjectId, SUniversalPColumnId } from "@platforma-sdk/model";

import { PlAdvancedFilterComponent } from "../../PlAdvancedFilter";
import type {
  PlAdvancedFilterItem,
  PlAdvancedFilterColumnId,
  PlAdvancedFilterSupportedFilters,
  PlAdvancedFilter,
} from "../../PlAdvancedFilter";
import type { Filter } from "../types";
import { validateTitle } from "../utils";

import $commonStyle from "./style.module.css";

const props = defineProps<
  Props & {
    step: Filter;
    onUpdateStep: (step: Filter) => void;
  }
>();

const withSelection = computed(() => {
  return props.hasSelectedColumns !== undefined && props.getValuesForSelectedColumns !== undefined;
});

function produceStepUpdate(updater: (draft: Filter) => void) {
  props.onUpdateStep(produce(props.step, updater));
}

function updateLabel(label: string) {
  produceStepUpdate((draft) => {
    draft.label = label;
  });
}

function updateFilter(filter: PlAdvancedFilter) {
  produceStepUpdate((draft) => {
    draft.filter = filter as typeof draft.filter;
  });
}

function addFilterPlaceholder() {
  if (props.columns.length === 0) return;
  produceStepUpdate((draft) => {
    draft.filter.filters.push({
      id: randomInt(),
      isExpanded: true,
      type: "or",
      filters: [
        {
          id: randomInt(),
          type: "isNA",
          column: props.columns[0].id as SUniversalPColumnId,
        },
      ],
    });
  });
}

async function addFilterFromSelected() {
  if (props.hasSelectedColumns === undefined || props.getValuesForSelectedColumns === undefined)
    return;

  const data = await props.getValuesForSelectedColumns();
  if (!data || data.values.length === 0) return;

  const { columnId, values } = data;
  const shortReminder =
    values.slice(0, 3).join(", ") + (values.length > 3 ? ` and ${values.length - 3} more` : "");

  produceStepUpdate((draft) => {
    draft.filter.filters.push({
      id: randomInt(),
      name: `Selected list (${shortReminder})`,
      isExpanded: false,
      type: "or",
      filters: values.map((value, i) => ({
        id: i,
        type: "patternEquals",
        column: columnId as SUniversalPColumnId,
        value,
      })),
    });
  });
}

const supportedFilters = [
  "isNA",
  "isNotNA",
  "greaterThan",
  "greaterThanOrEqual",
  "lessThan",
  "lessThanOrEqual",
  "patternEquals",
  "patternNotEquals",
  "patternContainSubsequence",
  "patternNotContainSubsequence",
  "equal",
  "notEqual",
  "topN",
  "bottomN",
] as (typeof PlAdvancedFilterSupportedFilters)[number][];
</script>

<template>
  <PlSidebarItem v-if="props.step">
    <template #header-content>
      <PlEditableTitle
        :key="props.step.id"
        :model-value="props.step.label"
        :class="{ [$commonStyle.flashing]: props.step.label.length === 0 }"
        :max-length="40"
        max-width="600px"
        placeholder="Label"
        :autofocus="props.step.label.length === 0"
        :validate="validateTitle"
        @update:model-value="updateLabel"
      />
    </template>
    <template #body-content>
      <PlAdvancedFilterComponent
        :class="[$style.root, { [$commonStyle.disabled]: props.step.label.length === 0 }]"
        :options="props.columns"
        :filters="props.step.filter as PlAdvancedFilter"
        :on-update-filters="updateFilter"
        :supported-filters="supportedFilters"
        :get-suggest-options="props.getSuggestOptions"
        :enable-dnd="false"
        :enable-add-group-button="true"
      >
        <template #add-group-buttons>
          <div :class="$style.actions">
            <PlBtnSecondary icon="add" @click="addFilterPlaceholder"> Add Filter </PlBtnSecondary>
            <PlBtnSecondary
              v-if="withSelection"
              icon="add"
              :disabled="props.hasSelectedColumns !== true"
              @click="addFilterFromSelected"
            >
              From selection
            </PlBtnSecondary>
          </div>
        </template>
      </PlAdvancedFilterComponent>
    </template>
  </PlSidebarItem>
</template>

<style module>
.root {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.actions {
  display: flex;
  flex-direction: row;
  gap: 12px;
}
</style>
