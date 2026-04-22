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

const props = defineProps<{
  columns: PTableColumnSpec[];
  pframeHandle: Nil | PFrameHandle;
  filters: PlDataTableFiltersWithMeta;
  defaultFilters: Nil | PlDataTableFiltersWithMeta;
  onUpdateFilters: (value: PlDataTableFiltersWithMeta) => void;
  onResetDefaultFilters?: () => void;
  onUpdateDefaultFilters?: (value: PlDataTableFiltersWithMeta) => void;
}>();

const teleportTarget = usePlBlockPageTitleTeleportTarget("PlTableFiltersV2");
const showManager = ref(false);
const hasFilters = computed(() => props.filters.filters.length > 0);
const hasDefaultFilters = computed(
  () => !isNil(props.defaultFilters) && props.defaultFilters.filters.length > 0,
);
const filters = computed<PlDataTableFiltersWithMeta>(() => {
  if (isNil(props.defaultFilters) || props.defaultFilters?.filters.length === 0) {
    return props.filters;
  }

  return {
    ...props.filters,
    filters: [...(props.defaultFilters?.filters ?? []), ...props.filters.filters],
  };
});
const onUpdateFilters = (_value: PlAdvancedFilter) => {
  const value = _value as PlDataTableFiltersWithMeta;

  if (isNil(props.defaultFilters)) {
    return props.onUpdateFilters(value);
  }

  const [defaults, ...rest] = value.filters;
  props.onUpdateFilters({ ...value, filters: rest });
  props.onUpdateDefaultFilters?.({ ...props.defaultFilters, filters: [defaults] });
};

const options = computed<PlAdvancedFilterItem[]>(() => {
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
        :filters="filters as PlAdvancedFilter"
        :options="options"
        :supported-filters="supportedFilters"
        :get-suggest-options="handleSuggestOptions"
        :is-pinned="(_, index) => hasDefaultFilters && index === 0"
        :is-removable="(_, index) => (hasDefaultFilters ? index > 0 : true)"
        :is-draggable="(_, index) => (hasDefaultFilters ? index > 0 : true)"
        :enable-dnd="false"
        :enable-toggling="true"
        :enable-add-group-button="true"
        @update-filters="onUpdateFilters"
      >
        <template #group-title="{ index }">
          <div v-if="hasDefaultFilters && index === 0" :class="$style.defaultGroupTitle">
            Default Group
            <PlBtnGhost
              v-if="isFunction(props.onResetDefaultFilters)"
              icon="restart"
              :class="$style.restartBtn"
              @click.stop="props.onResetDefaultFilters()"
            />
          </div>
          <div v-else>Custom Group</div>
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
