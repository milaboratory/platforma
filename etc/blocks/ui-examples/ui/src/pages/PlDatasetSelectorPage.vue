<script setup lang="ts">
import type { DatasetOption, PlRef, PrimaryRef } from "@platforma-sdk/model";
import { createPlRef, createPrimaryRef } from "@platforma-sdk/model";
import {
  PlBlockPage,
  PlCheckbox,
  PlContainer,
  PlDatasetSelector,
  PlRow,
} from "@platforma-sdk/ui-vue";
import { computed, reactive } from "vue";

// Sample dataset refs — mimic the PlRef shape produced by ctx.resultPool.getOptions()
// with `{ refsWithEnrichments: true }`: primary columns carry requireEnrichments.
const datasetWithFilters = createPlRef("leads-block", "clonotypes", true);
const datasetWithoutFilters = createPlRef("raw-block", "clonotypes", true);
const filterTop1000 = createPlRef("leads-block", "top1000");
const filterHighConfidence = createPlRef("leads-block", "high-confidence");

const data = reactive({
  disabled: false,
  clearable: true,
  required: false,
  optionsLoading: false,
  selected: createPrimaryRef(datasetWithFilters, filterTop1000) as PrimaryRef | PlRef | undefined,
  plainRefSelected: datasetWithoutFilters as PrimaryRef | PlRef | undefined,
  emptyOptionsSelected: undefined as PrimaryRef | PlRef | undefined,
});

const optionsBase: DatasetOption[] = [
  {
    label: "Leads — Clonotypes",
    ref: datasetWithFilters,
    filters: [
      { label: "Top 1000", ref: filterTop1000 },
      { label: "High confidence", ref: filterHighConfidence },
    ],
  },
  // No `filters` — component hides the filter dropdown when this is picked.
  { label: "Raw — Clonotypes", ref: datasetWithoutFilters },
];

const options = computed<readonly DatasetOption[] | undefined>(() =>
  data.optionsLoading ? undefined : optionsBase,
);

const emptyOptions = computed<readonly DatasetOption[] | undefined>(() =>
  data.optionsLoading ? undefined : [],
);
</script>

<template>
  <PlBlockPage style="max-width: 100%">
    <PlContainer>
      <PlRow>
        <PlCheckbox v-model="data.disabled">Disabled</PlCheckbox>
        <PlCheckbox v-model="data.required">Required</PlCheckbox>
        <PlCheckbox v-model="data.clearable">Clearable</PlCheckbox>
        <PlCheckbox v-model="data.optionsLoading">Options loading</PlCheckbox>
      </PlRow>

      <PlRow>
        <PlContainer width="400px">
          <PlDatasetSelector
            v-model="data.selected"
            :options="options"
            :disabled="data.disabled"
            :clearable="data.clearable"
            :required="data.required"
            label="Dataset with filters"
            filter-label="Filter"
            loading-options-helper="Loading datasets…"
          />

          <PlDatasetSelector
            v-model="data.plainRefSelected"
            :options="options"
            :disabled="data.disabled"
            :clearable="data.clearable"
            :required="data.required"
            label="Backward compat (plain PlRef modelValue)"
            helper="Selected value is a plain PlRef — the component normalizes it."
          />

          <PlDatasetSelector
            v-model="data.emptyOptionsSelected"
            :options="emptyOptions"
            :disabled="data.disabled"
            :clearable="data.clearable"
            :required="data.required"
            label="No datasets available"
            placeholder="No datasets yet"
          />
        </PlContainer>
      </PlRow>

      <PlRow>
        <pre>{{ data }}</pre>
      </PlRow>
    </PlContainer>
  </PlBlockPage>
</template>
