<script lang="ts" setup>
import type { PTableColumnSpec, PTableColumnId, ListOptionBase } from "@platforma-sdk/model";
import {
  canonicalizeJson,
  Annotation,
  Domain,
  readAnnotation,
  readDomain,
  parseJson,
  getAxisId,
} from "@platforma-sdk/model";
import { computed, onMounted, ref } from "vue";
import { PlBtnGhost, PlSlideModal, usePlBlockPageTitleTeleportTarget } from "@milaboratories/uikit";
import { randomInt } from "@milaboratories/helpers";
import {
  PlAdvancedFilter,
  PlAdvancedFilterSupportedFilters,
  type PlAdvancedFilterItem,
} from "../PlAdvancedFilter";
import type { PlAdvancedFilterColumnId } from "../PlAdvancedFilter/types";

const model = defineModel<PlAdvancedFilter>({ required: true });
const props = defineProps<{
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

// Convert PTableColumnSpec to PlAdvancedFilterColumnId
function makeFilterColumnId(spec: PTableColumnSpec): PlAdvancedFilterColumnId {
  const id: PTableColumnId =
    spec.type === "axis"
      ? { type: "axis", id: getAxisId(spec.spec) }
      : { type: "column", id: spec.id };
  return canonicalizeJson<PTableColumnId>(id) as unknown as PlAdvancedFilterColumnId;
}

// Convert PTableColumnSpec[] to PlAdvancedFilterItem[]
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
function getSuggestOptions(params: {
  columnId: PlAdvancedFilterColumnId;
  axisIdx?: number;
  searchStr: string;
  searchType: "value" | "label";
}): ListOptionBase<string | number>[] {
  const item = items.value.find((i) => i.id === params.columnId);
  if (!item) return [];

  const discreteValuesStr = readAnnotation(item.spec, Annotation.DiscreteValues);
  if (!discreteValuesStr) return [];

  try {
    const values = parseJson<(string | number)[]>(discreteValuesStr);
    return values
      .filter((v) => {
        if (!params.searchStr) return true;
        const str = String(v).toLowerCase();
        return str.includes(params.searchStr.toLowerCase());
      })
      .map((v) => ({ value: v, label: String(v) }));
  } catch {
    return [];
  }
}

// Add filter group
const addFilterGroup = () => {
  const firstColumn = items.value[0]?.id;
  if (!firstColumn) return;

  model.value = {
    ...model.value,
    filters: [
      ...model.value.filters,
      {
        id: randomInt(),
        isExpanded: true,
        type: "or",
        filters: [
          {
            id: randomInt(),
            type: "isNA",
            column: firstColumn,
          },
        ],
      } as PlAdvancedFilter["filters"][number],
    ],
  };
};
</script>

<template>
  <Teleport v-if="mounted && teleportTarget" :to="teleportTarget">
    <PlBtnGhost :icon="filtersOn ? 'filter-on' : 'filter'" @click.stop="showManager = true">
      Filters
    </PlBtnGhost>
  </Teleport>

  <PlSlideModal v-model="showManager" :close-on-outside-click="false">
    <template #title>Manage Filters</template>

    <div v-if="items.length > 0" :class="$style.root">
      <PlAdvancedFilter
        v-model:filters="model"
        :items="items"
        :supported-filters="supportedFilters"
        :get-suggest-options="getSuggestOptions"
        :enable-dnd="false"
        :enable-add-group-button="true"
      />
    </div>
    <div v-else>No filters applicable</div>
  </PlSlideModal>
</template>

<style module>
.root {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
