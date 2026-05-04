<script lang="ts">
/**
 * Select a dataset and (optionally) a filter column, emitting a {@link DatasetSelection}.
 *
 * The filter dropdown is always rendered and is clearable — leaving it empty
 * means "no filter". When the selected dataset has no compatible filters, the
 * dropdown opens to an empty option list.
 *
 * The emitted value bundles the user's pick (`primary`) with the auto-attached
 * `enrichments` payload from the matching `DatasetOption`. Enrichments are
 * opaque to the UI — block authors unbundle them inside their args resolver.
 */
export default {
  name: "PlDatasetSelector",
};
</script>

<script lang="ts" setup>
import type { DatasetOption, DatasetSelection, PlRef } from "@platforma-sdk/model";
import { createDatasetSelection, createPrimaryRef, plRefsEqual } from "@platforma-sdk/model";
import type { ListOption } from "@milaboratories/uikit";
import { PlDropdown, PlDropdownRef } from "@milaboratories/uikit";
import { computed } from "vue";

const slots = defineSlots<{
  tooltip?: () => unknown;
}>();

const model = defineModel<DatasetSelection | undefined>();

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
    clearable: false,
    required: false,
    disabled: false,
  },
);

const selectedDataset = computed<PlRef | undefined>(() => model.value?.primary.column);

const selectedFilter = computed<PlRef | undefined>(() => model.value?.primary.filter);

const currentDatasetOption = computed<DatasetOption | undefined>(() => {
  const dataset = selectedDataset.value;
  if (!dataset) return undefined;
  return props.options?.find((o) => plRefsEqual(o.primary.ref, dataset, true));
});

// PlDropdownRef expects `Option[]`; project the primary out of each entry.
const primaryOptions = computed<readonly { ref: PlRef; label: string }[] | undefined>(() =>
  props.options?.map((o) => o.primary),
);

const filterOptions = computed<ListOption<PlRef>[]>(
  () => currentDatasetOption.value?.filters?.map((f) => ({ label: f.label, value: f.ref })) ?? [],
);

function emitValue(dataset: PlRef | undefined, filter: PlRef | undefined) {
  if (dataset === undefined) {
    model.value = undefined;
    return;
  }
  // Resolve from `props.options` directly — `currentDatasetOption` may not
  // have recomputed yet when this runs synchronously inside a change handler.
  const option = props.options?.find((o) => plRefsEqual(o.primary.ref, dataset, true));
  model.value = createDatasetSelection(createPrimaryRef(dataset, filter), option?.enrichments);
}

function onDatasetChange(dataset: PlRef | undefined) {
  emitValue(dataset, undefined);
}

function onFilterChange(value: PlRef | undefined) {
  const dataset = selectedDataset.value;
  if (!dataset) return;
  emitValue(dataset, value);
}
</script>

<template>
  <div class="pl-dataset-selector">
    <PlDropdownRef
      :model-value="selectedDataset"
      :options="primaryOptions"
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
      :model-value="selectedFilter"
      :options="filterOptions"
      :label="filterLabel"
      :placeholder="filterPlaceholder"
      :disabled="disabled"
      clearable
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
