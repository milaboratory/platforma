<script lang="ts" setup>
import type {
  PTableColumnSpec,
  PlDataTableFiltersWithMeta,
  PFrameHandle,
  PTableColumnId,
  CanonicalizedJson,
} from "@platforma-sdk/model";
import {
  canonicalizeJson,
  Annotation,
  Domain,
  readAnnotation,
  readDomain,
  getUniqueSourceValuesWithLabels,
  parseJson,
  getPTableColumnId,
} from "@platforma-sdk/model";
import { computed, ref } from "vue";
import { PlBtnGhost, PlSlideModal, usePlBlockPageTitleTeleportTarget } from "@milaboratories/uikit";
import {
  PlAdvancedFilter,
  PlAdvancedFilterComponent,
  PlAdvancedFilterSupportedFilters,
  type PlAdvancedFilterItem,
} from "../PlAdvancedFilter";
import type { PlAdvancedFilterColumnId } from "../PlAdvancedFilter/types";
import type { Nil } from "@milaboratories/helpers";
import { isFunction, isNil } from "es-toolkit";

const filtersModel = defineModel<PlDataTableFiltersWithMeta>("filters", { required: true });
const defaultFiltersModel = defineModel<PlDataTableFiltersWithMeta>("default-filters");
const props = defineProps<{
  pframeHandle: Nil | PFrameHandle;
  columns: PTableColumnSpec[];
  resetDefaultFilters?: () => void;
}>();

const teleportTarget = usePlBlockPageTitleTeleportTarget("PlTableFiltersV2");
const showManager = ref(false);
const hasFilters = computed(() => filtersModel.value.filters.length > 0);
const hasDefaultFilters = computed(
  () => !isNil(defaultFiltersModel.value) && defaultFiltersModel.value.filters.length > 0,
);
const allFilters = computed<PlDataTableFiltersWithMeta>({
  get: () => {
    if (isNil(defaultFiltersModel.value) || defaultFiltersModel.value?.filters.length === 0) {
      return filtersModel.value;
    }

    console.log(">>debugger get");
    return {
      ...filtersModel.value,
      filters: [...defaultFiltersModel.value.filters, ...filtersModel.value.filters],
    } as PlDataTableFiltersWithMeta;
  },
  set: (value) => {
    if (isNil(defaultFiltersModel.value)) {
      filtersModel.value = value;
    }

    console.log(">>debugger set");
    const [defaults, ...rest] = value.filters;
    // @ts-ignore
    defaultFiltersModel.value = { ...defaultFiltersModel.value, filters: [defaults] };
    filtersModel.value = { ...filtersModel.value, filters: rest };
  },
});

const items = computed<PlAdvancedFilterItem[]>(() => {
  return props.columns.map((col, idx) => {
    const id = makeFilterColumnId(col);
    const label =
      readAnnotation(col.spec, Annotation.Label)?.trim() ?? `Unlabeled ${col.type} ${idx}`;
    const alphabet =
      readDomain(col.spec, Domain.Alphabet) ?? readAnnotation(col.spec, Annotation.Alphabet);
    return {
      id,
      label,
      spec: col.spec,
      alphabet: alphabet ?? undefined,
    };
  });
});

// Supported filters (same set as FilterSidebar)
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
  "patternMatchesRegularExpression",
  "patternFuzzyContainSubsequence",
  "equal",
  "notEqual",
] as (typeof PlAdvancedFilterSupportedFilters)[number][];

// getSuggestOptions - provide discrete values from column annotations
function handleSuggestOptions(params: {
  columnId: PlAdvancedFilterColumnId;
  axisIdx?: number;
  searchStr: string;
  searchType: "value" | "label";
}) {
  if (isNil(props.pframeHandle)) {
    console.warn("PFrame handle is not available, cannot fetch suggest options");
    return [];
  }

  const strId = params.columnId as CanonicalizedJson<PTableColumnId>;
  const tableColumnId = parseJson<PTableColumnId>(strId);

  if (tableColumnId.type !== "column") {
    throw new Error("ColumnId should be of type 'column' for suggest options");
  }

  return getUniqueSourceValuesWithLabels(props.pframeHandle, {
    columnId: tableColumnId.id,
    axisIdx: params.axisIdx,
    limit: 100,
    searchQuery: params.searchType === "label" ? params.searchStr : undefined,
    searchQueryValue: params.searchType === "value" ? params.searchStr : undefined,
  }).then((v) => v.values);
}

function makeFilterColumnId(spec: PTableColumnSpec): CanonicalizedJson<PTableColumnId> {
  return canonicalizeJson<PTableColumnId>(getPTableColumnId(spec));
}
</script>

<template>
  <Teleport v-if="teleportTarget" :to="teleportTarget">
    <PlBtnGhost
      :icon="hasFilters || hasDefaultFilters ? 'filter-on' : 'filter'"
      @click.stop="showManager = true"
    >
      Filters
    </PlBtnGhost>
  </Teleport>

  <PlSlideModal v-model="showManager" :close-on-outside-click="false">
    <template #title>Manage Filters</template>

    <div :class="$style.root">
      <PlAdvancedFilterComponent
        v-model:filters="allFilters as PlAdvancedFilter"
        :items="items"
        :supported-filters="supportedFilters"
        :get-suggest-options="handleSuggestOptions"
        :is-pinned="(_, index) => hasDefaultFilters && index === 0"
        :enable-dnd="false"
        :enable-toggling="true"
        :enable-add-group-button="true"
      >
        <template #group-title="item">
          <div :class="$style.defaultGroupTitle">
            Default Group
            <PlBtnGhost
              v-if="isFunction(props.resetDefaultFilters)"
              icon="restart"
              :class="$style.restartBtn"
              @click.stop="props.resetDefaultFilters()"
            />
            Custom Group
          </div>
        </template>
      </PlAdvancedFilterComponent>
    </div>
  </PlSlideModal>
</template>

<style module>
.root {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.defaultGroupTitle {
  display: flex;
  align-items: center;
  gap: 4px;
}
.restartBtn {
  width: 24px;
  height: 24px;
  padding: 4px;
  --button-width: 24px;
  --btn-min-width: 24px;
  --button-height: 24px;
  --btn-min-height: 24x;
}
</style>
