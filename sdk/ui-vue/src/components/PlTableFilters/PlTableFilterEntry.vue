<script setup lang="ts">
import { PlDropdown, PlTextField, PlToggleSwitch, Slider, type ListOption } from '@milaboratories/uikit';
import type { PlTableFiltersStateEntry, PlTableFilterType, PTableColumnSpec } from '@platforma-sdk/model';
import { toRefs } from 'vue';
import { changeFilterType, parseNumber, parseString, parseRegex, makeWildcardOptions } from './filters_logic';

const entry = defineModel<PlTableFiltersStateEntry>({ required: true });
const props = defineProps<{
  column: Readonly<PTableColumnSpec>;
  options: Readonly<ListOption<PlTableFilterType>[]>;
}>();
const { column, options } = toRefs(props);
</script>

<template>
  <div class="d-flex flex-column gap-24">
    <PlDropdown
      :model-value="entry.filter.type"
      :options="options"
      label="Predicate"
      @update:model-value="(type) => (entry = changeFilterType(entry, type!))"
    />
    <template
      v-if="
        entry.filter.type === 'number_equals' ||
        entry.filter.type === 'number_notEquals' ||
        entry.filter.type === 'number_lessThan' ||
        entry.filter.type === 'number_lessThanOrEqualTo' ||
        entry.filter.type === 'number_greaterThan' ||
        entry.filter.type === 'number_greaterThanOrEqualTo'
      "
    >
      <PlTextField v-model="entry.filter.reference" :parse="(value: string): number => parseNumber(column, value)" label="Reference value" />
    </template>
    <template v-if="entry.filter.type === 'number_between'">
      <PlTextField v-model="entry.filter.lowerBound" :parse="(value: string): number => parseNumber(column, value)" label="Lower bound" />
      <PlToggleSwitch v-model="entry.filter.includeLowerBound" label="Include lower bound" />
      <PlTextField v-model="entry.filter.upperBound" :parse="(value: string): number => parseNumber(column, value)" label="Upper bound" />
      <PlToggleSwitch v-model="entry.filter.includeUpperBound" label="Include upper bound" />
    </template>
    <template
      v-if="
        entry.filter.type === 'string_equals' ||
        entry.filter.type === 'string_notEquals' ||
        entry.filter.type === 'string_contains' ||
        entry.filter.type === 'string_doesNotContain'
      "
    >
      <PlTextField v-model="entry.filter.reference" :parse="(value: string): string => parseString(column, value)" label="Reference value" />
    </template>
    <template v-if="entry.filter.type === 'string_matches' || entry.filter.type === 'string_doesNotMatch'">
      <PlTextField v-model="entry.filter.reference" :parse="parseRegex" label="Reference value" />
    </template>
    <template v-if="entry.filter.type === 'string_containsFuzzyMatch'">
      <PlTextField v-model="entry.filter.reference" :parse="(value: string): string => parseString(column, value)" label="Reference value" />
      <Slider v-model="entry.filter.maxEdits" :max="5" breakpoints label="Maximum nuber of substitutions and indels" />
      <PlToggleSwitch v-model="entry.filter.substitutionsOnly" label="Substitutions only" />
      <PlDropdown v-model="entry.filter.wildcard" :options="makeWildcardOptions(column, entry.filter.reference)" clearable label="Wildcard symbol" />
    </template>
  </div>
</template>
