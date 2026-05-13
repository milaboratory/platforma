<script lang="ts">
/**
 * Select a dataset or one of its filters in a single dropdown, emitting a
 * {@link DatasetSelection}.
 *
 * Each `DatasetOption` contributes one row for its primary plus one row per
 * filter — filters are listed directly underneath their parent dataset and
 * carry the parent's primary label as the row description. Filter labels are
 * derived by `buildDatasetOptions` from each filter column's latest
 * `pl7.app/trace` step (the producing block's self-description).
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
import type {
  DatasetOption,
  DatasetSelection,
  LabeledEnrichmentRefs,
  PlRef,
} from "@platforma-sdk/model";
import { createDatasetSelection, createPrimaryRef } from "@platforma-sdk/model";
import type { ListOption } from "@milaboratories/uikit";
import { PlDropdown } from "@milaboratories/uikit";
import { computed } from "vue";

const slots = defineSlots<{
  tooltip?: () => unknown;
}>();

const model = defineModel<DatasetSelection | undefined>();

const props = withDefaults(
  defineProps<{
    /** Available datasets, each optionally carrying compatible filter choices. */
    options?: Readonly<DatasetOption[]>;
    /** Label above the dropdown. */
    label?: string;
    /** Helper text below the dropdown (shown when there is no error). */
    helper?: string;
    /** Helper text shown while `options` is undefined (loading). */
    loadingOptionsHelper?: string;
    /** Error message displayed below the dropdown. */
    error?: unknown;
    /** Placeholder when nothing is selected. */
    placeholder?: string;
    /** Show a clear button. */
    clearable?: boolean;
    /** Mark the dropdown as required. */
    required?: boolean;
    /** Disable interaction. */
    disabled?: boolean;
  }>(),
  {
    options: undefined,
    label: undefined,
    helper: undefined,
    loadingOptionsHelper: undefined,
    error: undefined,
    placeholder: "...",
    clearable: false,
    required: false,
    disabled: false,
  },
);

type Selection = { primary: PlRef; filter?: PlRef; enrichments?: LabeledEnrichmentRefs };

// `deepEqual` (used by PlDropdown for matching) treats `{a, b: undefined}` and
// `{a}` as different shapes, so the option list and the selection value must
// agree on optional-key presence.
function makeSelection(
  primary: PlRef,
  filter: PlRef | undefined,
  enrichments: LabeledEnrichmentRefs | undefined,
): Selection {
  return {
    primary,
    ...(filter !== undefined && { filter }),
    ...(enrichments !== undefined && enrichments.length > 0 && { enrichments }),
  };
}

const selectionValue = computed<Selection | undefined>(() => {
  const primary = model.value?.primary;
  if (primary === undefined) return undefined;
  return makeSelection(primary.column, primary.filter, model.value?.enrichments);
});

const dropdownOptions = computed<ListOption<Selection>[] | undefined>(() => {
  if (props.options === undefined) return undefined;
  const out: ListOption<Selection>[] = [];
  for (const o of props.options) {
    out.push({
      label: o.primary.label,
      value: makeSelection(o.primary.ref, undefined, o.enrichments),
    });
    for (const filter of o.filters ?? []) {
      out.push({
        label: filter.label,
        description: o.primary.label,
        value: makeSelection(o.primary.ref, filter.ref, o.enrichments),
      });
    }
  }
  return out;
});

function onChange(selection: Selection | undefined) {
  if (selection === undefined) {
    model.value = undefined;
    return;
  }
  model.value = createDatasetSelection(
    createPrimaryRef(selection.primary, selection.filter),
    selection.enrichments,
  );
}
</script>

<template>
  <PlDropdown
    :model-value="selectionValue"
    :options="dropdownOptions"
    :label="label"
    :helper="helper"
    :loading-options-helper="loadingOptionsHelper"
    :error="error"
    :placeholder="placeholder"
    :clearable="clearable"
    :required="required"
    :disabled="disabled"
    @update:model-value="onChange"
  >
    <template v-if="slots.tooltip" #tooltip>
      <slot name="tooltip" />
    </template>
  </PlDropdown>
</template>
