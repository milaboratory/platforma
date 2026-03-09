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
  getAxisId,
  getUniqueSourceValuesWithLabels,
  parseJson,
} from "@platforma-sdk/model";
import { computed, onMounted, ref } from "vue";
import { PlBtnGhost, PlSlideModal, usePlBlockPageTitleTeleportTarget } from "@milaboratories/uikit";
import {
  PlAdvancedFilter,
  PlAdvancedFilterComponent,
  PlAdvancedFilterSupportedFilters,
  type PlAdvancedFilterItem,
} from "../PlAdvancedFilter";
import type { PlAdvancedFilterColumnId } from "../PlAdvancedFilter/types";
import type { Nil } from "@milaboratories/helpers";
import { isNil } from "es-toolkit";

const model = defineModel<PlDataTableFiltersWithMeta>({ required: true });
const props = defineProps<{
  pframeHandle: Nil | PFrameHandle;
  columns: PTableColumnSpec[];
}>();

// Teleport for "Filters" button
const mounted = ref(false);
onMounted(() => {
  mounted.value = true;
});
const teleportTarget = usePlBlockPageTitleTeleportTarget("PlTableFiltersV2");
const showManager = ref(false);

// Check if any filters are active
const filtersOn = computed(() => {
  return model.value.filters.length > 0;
});

function makeFilterColumnId(spec: PTableColumnSpec): CanonicalizedJson<PTableColumnId> {
  const id: PTableColumnId =
    spec.type === "axis"
      ? { type: "axis", id: getAxisId(spec.spec) }
      : { type: "column", id: spec.id };
  return canonicalizeJson<PTableColumnId>(id);
}

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
</script>

<template>
  <Teleport v-if="mounted && teleportTarget" :to="teleportTarget">
    <PlBtnGhost :icon="filtersOn ? 'filter-on' : 'filter'" @click.stop="showManager = true">
      Filters
    </PlBtnGhost>
  </Teleport>

  <PlSlideModal v-model="showManager" :close-on-outside-click="false">
    <template #title>Manage Filters</template>

    <div :class="$style.root">
      <PlAdvancedFilterComponent
        v-model:filters="model as PlAdvancedFilter"
        :items="items"
        :supported-filters="supportedFilters"
        :get-suggest-options="handleSuggestOptions"
        :enable-dnd="false"
        :enable-add-group-button="true"
      />
    </div>
  </PlSlideModal>
</template>

<style module>
.root {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
