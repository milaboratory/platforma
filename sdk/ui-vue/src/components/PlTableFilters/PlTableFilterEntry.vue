<script setup lang="ts">
import {
  PlDropdown,
  PlTextField,
  PlToggleSwitch,
  Slider,
  type ListOption,
} from '@milaboratories/uikit';
import type {
  PlTableFiltersStateEntry,
  PlTableFilterType,
  PTableColumnSpec,
} from '@platforma-sdk/model';
import { computed, toRefs } from 'vue';
import {
  changeFilterType,
  parseNumber,
  parseString,
  parseRegex,
  makeWildcardOptions,
  isFilterDiscrete,
  makeDiscreteOptions,
} from './filters_logic';

const entry = defineModel<PlTableFiltersStateEntry>({ required: true });
const props = defineProps<{
  column: Readonly<PTableColumnSpec>;
  options: Readonly<ListOption<PlTableFilterType>[]>;
  disabled?: boolean;
}>();
const { column, options } = toRefs(props);

const discreteOptions = computed(() => makeDiscreteOptions(column.value));
</script>

<template>
  <div class="d-flex flex-column gap-24">
    <PlDropdown
      :model-value="entry.filter.type"
      :options="options"
      :disabled="disabled"
      label="Predicate"
      @update:model-value="(type) => (entry = changeFilterType(entry, type!, discreteOptions))"
    />

    <template v-if="discreteOptions.length > 0 && isFilterDiscrete(entry.filter)">
      <PlDropdown
        v-model="entry.filter.reference"
        :options="discreteOptions"
      />
    </template>

    <template v-else>
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
        <PlTextField
          v-model="entry.filter.reference"
          :disabled="disabled"
          :parse="(value: string): number => parseNumber(column, value)"
          label="Reference value"
        />
      </template>
      <template v-if="entry.filter.type === 'number_between'">
        <PlTextField
          v-model="entry.filter.lowerBound"
          :disabled="disabled"
          :parse="(value: string): number => parseNumber(column, value)"
          label="Lower bound"
        />
        <PlToggleSwitch v-model="entry.filter.includeLowerBound" :disabled="disabled" label="Include lower bound" />
        <PlTextField
          v-model="entry.filter.upperBound"
          :disabled="disabled"
          :parse="(value: string): number => parseNumber(column, value)"
          label="Upper bound"
        />
        <PlToggleSwitch v-model="entry.filter.includeUpperBound" :disabled="disabled" label="Include upper bound" />
      </template>
      <template
        v-if="
          entry.filter.type === 'string_equals' ||
            entry.filter.type === 'string_notEquals' ||
            entry.filter.type === 'string_contains' ||
            entry.filter.type === 'string_doesNotContain'
        "
      >
        <PlTextField
          v-model="entry.filter.reference"
          :disabled="disabled"
          :parse="(value: string): string => parseString(column, value)"
          label="Reference value"
        />
      </template>
      <template v-if="entry.filter.type === 'string_matches' || entry.filter.type === 'string_doesNotMatch'">
        <PlTextField v-model="entry.filter.reference" :disabled="disabled" :parse="parseRegex" label="Reference value" />
      </template>
      <template v-if="entry.filter.type === 'string_containsFuzzyMatch'">
        <PlTextField
          v-model="entry.filter.reference"
          :disabled="disabled"
          :parse="(value: string): string => parseString(column, value)"
          label="Reference value"
        />
        <Slider v-model="entry.filter.maxEdits" :max="5" :disabled="disabled" breakpoints label="Maximum nuber of substitutions and indels" />
        <PlToggleSwitch v-model="entry.filter.substitutionsOnly" :disabled="disabled" label="Substitutions only" />
        <PlDropdown
          v-model="entry.filter.wildcard"
          :disabled="disabled"
          :options="makeWildcardOptions(column, entry.filter.reference)"
          clearable
          label="Wildcard symbol"
        />
      </template>
    </template>
  </div>
</template>
