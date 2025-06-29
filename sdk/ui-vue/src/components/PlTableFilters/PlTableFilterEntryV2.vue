<script setup lang="ts">
import {
  PlDropdown,
  PlTextField,
  PlToggleSwitch,
  Slider,
  PlMaskIcon24,
} from '@milaboratories/uikit';
import {
  changeFilter,
  parseNumber,
  parseString,
  parseRegex,
  makeWildcardOptions,
  isFilterDiscrete,
  getFilterDefault,
} from './filters_logic';
import type { PlDataTableFilterStateInternal } from './types';
import { watchEffect } from 'vue';

const entry = defineModel<PlDataTableFilterStateInternal>({ required: true });
watchEffect(() => {
  if (!entry.value.filter) {
    entry.value.filter = {
      value: getFilterDefault(entry.value.options[0].value),
      disabled: false,
      open: true,
    };
  }
});
</script>

<template>
  <div v-if="entry.filter" class="d-flex flex-column gap-24">
    <PlDropdown
      :model-value="entry.filter.value.type"
      :options="entry.options"
      :disabled="entry.filter.disabled"
      label="Predicate"
      @update:model-value="(type) => (entry.filter!.value = changeFilter(entry.filter!.value, type!, entry.discreteOptions))"
    />

    <template v-if="entry.discreteOptions.length > 0 && isFilterDiscrete(entry.filter.value)">
      <PlDropdown
        v-model="entry.filter.value.reference"
        :options="entry.discreteOptions"
      />
    </template>
    <template v-else>
      <template
        v-if="
          entry.filter.value.type === 'number_equals' ||
            entry.filter.value.type === 'number_notEquals' ||
            entry.filter.value.type === 'number_lessThan' ||
            entry.filter.value.type === 'number_lessThanOrEqualTo' ||
            entry.filter.value.type === 'number_greaterThan' ||
            entry.filter.value.type === 'number_greaterThanOrEqualTo'
        "
      >
        <PlTextField
          v-model="entry.filter.value.reference"
          :disabled="entry.filter.disabled"
          :parse="(value: string): number => parseNumber(entry.spec, value)"
          label="Reference value"
        />
      </template>

      <template
        v-if="
          entry.filter.value.type === 'number_between'
        "
      >
        <PlTextField
          v-model="entry.filter.value.lowerBound"
          :disabled="entry.filter.disabled"
          :parse="(value: string): number => parseNumber(entry.spec, value)"
          label="Lower bound"
        />
        <PlToggleSwitch
          v-model="entry.filter.value.includeLowerBound"
          :disabled="entry.filter.disabled"
          label="Include lower bound"
        />
        <PlTextField
          v-model="entry.filter.value.upperBound"
          :disabled="entry.filter.disabled"
          :parse="(value: string): number => parseNumber(entry.spec, value)"
          label="Upper bound"
        />
        <PlToggleSwitch
          v-model="entry.filter.value.includeUpperBound"
          :disabled="entry.filter.disabled"
          label="Include upper bound"
        />
      </template>

      <template
        v-if="
          entry.filter.value.type === 'string_equals' ||
            entry.filter.value.type === 'string_notEquals' ||
            entry.filter.value.type === 'string_contains' ||
            entry.filter.value.type === 'string_doesNotContain'
        "
      >
        <PlTextField
          v-model="entry.filter.value.reference"
          :disabled="entry.filter.disabled"
          :parse="(value: string): string => parseString(entry.spec, value)"
          label="Reference value"
        />
      </template>

      <template
        v-if="
          entry.filter.value.type === 'string_matches' ||
            entry.filter.value.type === 'string_doesNotMatch'
        "
      >
        <PlTextField
          v-model="entry.filter.value.reference"
          :disabled="entry.filter.disabled"
          :parse="parseRegex"
          label="Reference value"
        />
      </template>

      <template
        v-if="
          entry.filter.value.type === 'string_containsFuzzyMatch'
        "
      >
        <PlTextField
          v-model="entry.filter.value.reference"
          :disabled="entry.filter.disabled"
          :parse="(value: string): string => parseString(entry.spec, value)"
          label="Reference value"
        />
        <Slider
          v-model="entry.filter.value.maxEdits"
          :max="5"
          :disabled="entry.filter.disabled"
          breakpoints label="Maximum nuber of substitutions and indels"
        />
        <PlToggleSwitch
          v-model="entry.filter.value.substitutionsOnly"
          :disabled="entry.filter.disabled"
          label="Substitutions only"
        />
        <PlDropdown
          v-model="entry.filter.value.wildcard"
          :disabled="entry.filter.disabled"
          :options="makeWildcardOptions(entry.spec, entry.filter.value.reference)"
          clearable
          label="Wildcard symbol"
        />
      </template>
    </template>

    <div v-if="entry.defaultFilter" class="d-flex justify-center">
      <div
        :class="[
          $style['revert-btn'],
          'text-s-btn',
          'd-flex',
          'align-center',
          'gap-8',
          { disabled: entry.filter.disabled },
        ]"
        @click="entry.filter.value = entry.defaultFilter"
      >
        Revert Settings to Default
        <PlMaskIcon24 name="reverse" />
      </div>
    </div>
  </div>
</template>

<style module>
.revert-btn {
    padding: 8px 14px;
    border-radius: 6px;
    cursor: pointer;
}

.revert-btn:hover {
    background-color: var(--btn-sec-hover-grey);
}

.revert-btn.disabled {
    opacity: 0.3;
    pointer-events: none;
}
</style>
