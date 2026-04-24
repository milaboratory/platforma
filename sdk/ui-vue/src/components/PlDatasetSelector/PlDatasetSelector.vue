<script lang="ts">
/**
 * Select a dataset and (optionally) a filter column, emitting a `PrimaryRef`.
 *
 * Behaves like {@link PlDropdownRef} when none of the offered datasets carry
 * filter options. When the selected dataset has compatible filters, a second
 * dropdown appears with the filters plus a "No filter" entry.
 *
 * Accepts `PrimaryRef | PlRef | undefined` as `modelValue` (a plain `PlRef`
 * is treated as an unfiltered dataset), but always emits `PrimaryRef`
 * (or `undefined` when cleared).
 */
export default {
  name: "PlDatasetSelector",
};
</script>

<script lang="ts" setup>
import type { DatasetOption, PlRef, PrimaryRef } from "@platforma-sdk/model";
import { createPrimaryRef, isPrimaryRef, plRefsEqual } from "@platforma-sdk/model";
import type { ListOption } from "@milaboratories/uikit";
import { PlDropdown, PlDropdownRef } from "@milaboratories/uikit";
import { computed } from "vue";

const slots = defineSlots<{
  tooltip?: () => unknown;
}>();

/**
 * v-model value. Accepts `PrimaryRef`, plain `PlRef` (treated as unfiltered),
 * or `undefined`. Writes always emit `PrimaryRef` or `undefined`.
 */
const model = defineModel<PrimaryRef | PlRef | undefined>();

const props = withDefaults(
  defineProps<{
    /** Available datasets, each optionally carrying compatible filter choices. */
    options?: Readonly<DatasetOption[]>;
    /** Label above the dataset dropdown. */
    label?: string;
    /** Helper text below the dataset dropdown (shown when there is no error). */
    helper?: string;
    /** Helper text shown while `options` is undefined (loading). */
    loadingOptionsHelper?: string;
    /** Error message displayed below the dataset dropdown. */
    error?: unknown;
    /** Placeholder when no dataset is selected. */
    placeholder?: string;
    /** Label above the filter dropdown. */
    filterLabel?: string;
    /** Placeholder for the filter dropdown. */
    filterPlaceholder?: string;
    /** Label of the "no filter" entry prepended to the filter options. */
    noFilterLabel?: string;
    /** Show a clear button on the dataset dropdown. */
    clearable?: boolean;
    /** Mark the dataset dropdown as required. */
    required?: boolean;
    /** Disable all interaction. */
    disabled?: boolean;
  }>(),
  {
    options: undefined,
    label: undefined,
    helper: undefined,
    loadingOptionsHelper: undefined,
    error: undefined,
    placeholder: "...",
    filterLabel: "",
    filterPlaceholder: "...",
    noFilterLabel: "No filter",
    clearable: false,
    required: false,
    disabled: false,
  },
);

const selectedDataset = computed<PlRef | undefined>(() => {
  const v = model.value;
  if (v === undefined) return undefined;
  return isPrimaryRef(v) ? v.column : v;
});

const selectedFilter = computed<PlRef | undefined>(() => {
  const v = model.value;
  return isPrimaryRef(v) ? v.filter : undefined;
});

const currentDatasetOption = computed<DatasetOption | undefined>(() => {
  const dataset = selectedDataset.value;
  if (!dataset) return undefined;
  return props.options?.find((o) => plRefsEqual(o.ref, dataset, true));
});

const hasFilters = computed(() => (currentDatasetOption.value?.filters?.length ?? 0) > 0);

/**
 * Filter dropdown options. The first entry (`null`) is the "No filter" choice —
 * null distinguishes it from `undefined` (dropdown clear button, disabled here).
 */
const filterOptions = computed<ListOption<PlRef | null>[]>(() => {
  const filters = currentDatasetOption.value?.filters;
  if (!filters) return [];
  return [
    { label: props.noFilterLabel, value: null } as ListOption<PlRef | null>,
    ...filters.map((f) => ({ label: f.label, value: f.ref }) as ListOption<PlRef | null>),
  ];
});

const filterValue = computed<PlRef | null>(() => selectedFilter.value ?? null);

function emitValue(dataset: PlRef | undefined, filter: PlRef | undefined) {
  model.value = dataset === undefined ? undefined : createPrimaryRef(dataset, filter);
}

function onDatasetChange(dataset: PlRef | undefined) {
  emitValue(dataset, undefined);
}

function onFilterChange(value: PlRef | null | undefined) {
  const dataset = selectedDataset.value;
  if (!dataset) return;
  emitValue(dataset, value ?? undefined);
}
</script>

<template>
  <div class="pl-dataset-selector">
    <PlDropdownRef
      :model-value="selectedDataset"
      :options="options"
      :label="label"
      :helper="helper"
      :loading-options-helper="loadingOptionsHelper"
      :error="error"
      :placeholder="placeholder"
      :clearable="clearable"
      :required="required"
      :disabled="disabled"
      @update:model-value="onDatasetChange"
    >
      <template v-if="slots.tooltip" #tooltip>
        <slot name="tooltip" />
      </template>
    </PlDropdownRef>
    <PlDropdown
      v-if="hasFilters"
      :model-value="filterValue"
      :options="filterOptions"
      :label="filterLabel"
      :placeholder="filterPlaceholder"
      :disabled="disabled"
      @update:model-value="onFilterChange"
    />
  </div>
</template>

<style scoped>
.pl-dataset-selector {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
