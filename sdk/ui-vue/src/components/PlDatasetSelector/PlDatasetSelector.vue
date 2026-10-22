<script lang="ts">
/**
 * Select a dataset or one of its filters in a single dropdown, emitting a
 * {@link DatasetSelection}. Filter labels carry the dataset name as a
 * prefix (e.g. "Bulk / Top 10"), so no separate subtitle is rendered.
 * Enrichments from the matching `DatasetOption` are bundled into the
 * emitted value opaquely — block authors unbundle them in their args
 * resolver.
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
  PObjectId,
  PlRef,
} from "@platforma-sdk/model";
import {
  createDatasetSelection,
  createGlobalPObjectId,
  createPrimaryRef,
  plRefsEqual,
} from "@platforma-sdk/model";
import type { ListOption } from "@milaboratories/uikit";
import { PlDropdown } from "@milaboratories/uikit";
import { computed } from "vue";
import { useColumnLinksMissingValue } from "../ValuePickers/columnLinksMissingValue";

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
  // Read enrichments from the current option, not from `model.value`: the
  // stored enrichments are a snapshot at selection time and won't match
  // `dropdownOptions` after `props.options` recomputes (e.g. when the
  // result pool gains or loses an enrichment column).
  // The option's ref, not the stored one, for the same reason: a ref stored with
  // a different `requireEnrichments` flag than the options carry (e.g. saved
  // before a block changed its `buildDatasetOptions` mode) would not match any
  // option and the selection would show empty.
  const option = props.options?.find((o) => plRefsEqual(o.primary.ref, primary.column, true));
  return makeSelection(option?.primary.ref ?? primary.column, primary.filter, option?.enrichments);
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

const columnLinks = useColumnLinksMissingValue();

/**
 * The column a selection the options lack is shown and explained by: the dataset first, as the
 * filter of a missing dataset is missing with it, then the filter; `undefined` when the column
 * links tell nothing about either.
 */
function explainedColumn(): PObjectId | undefined {
  const primary = model.value?.primary;
  if (columnLinks === undefined || primary === undefined) return undefined;
  const refs = primary.filter === undefined ? [primary.column] : [primary.column, primary.filter];
  return refs
    .map((ref) => createGlobalPObjectId(ref.blockId, ref.name))
    .find((column) => columnLinks.tooltip(column) !== undefined);
}

const missingValueLabel = () => {
  const column = explainedColumn();
  return column === undefined ? undefined : columnLinks?.label(column);
};

const missingValueTooltip = () => {
  const column = explainedColumn();
  return column === undefined ? undefined : columnLinks?.tooltip(column);
};

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
    data-testid="pl-dataset-selector"
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
    :missing-value-label="missingValueLabel"
    :missing-value-tooltip="missingValueTooltip"
    @update:model-value="onChange"
  >
    <template v-if="slots.tooltip" #tooltip>
      <slot name="tooltip" />
    </template>
  </PlDropdown>
</template>
