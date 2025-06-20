<script lang="ts" setup>
import {
  PlDropdownLine,
} from '@milaboratories/uikit';
import type {
  PlDataTableSheet,
  PlDataTableSheetState,
} from '@platforma-sdk/model';
import {
  getAxisId,
} from '@platforma-sdk/model';
import {
  computed,
  watchEffect,
} from 'vue';
import type {
  PlDataTableSheetsSettings,
  PlDataTableSheetNormalized,
} from './types';
import {
  isJsonEqual,
} from '@milaboratories/helpers';

const state = defineModel<PlDataTableSheetState[]>({
  default: [],
});
const props = defineProps<{
  settings: Readonly<PlDataTableSheetsSettings>;
}>();

// Normalize sheets: skip sheets with no options, set default values
const sheets = computed<PlDataTableSheetNormalized[]>(() => {
  return props.settings.sheets
    .filter((sheet) => sheet.options.length > 0)
    .map((sheet, i) => {
      const axisId = getAxisId(sheet.axis);

      const getDefaultValue = (): string | number => {
        const cachedState = props.settings.cachedState.find((s) => {
          return isJsonEqual(s.axisId, axisId);
        });
        if (cachedState && isValidOption(sheet, cachedState.value)) {
          return cachedState.value;
        }
        if (sheet.defaultValue && isValidOption(sheet, sheet.defaultValue)) {
          return sheet.defaultValue;
        }
        return sheet.options[0].value;
      };

      const makePrefix = (): string => {
        return (sheet.axis.annotations?.['pl7.app/label']?.trim()
          ?? `Unlabeled axis ${i}`) + ':';
      };

      return {
        axisId,
        prefix: makePrefix(),
        options: sheet.options,
        defaultValue: getDefaultValue(),
      } satisfies PlDataTableSheetNormalized;
    });
});

// Restore state from settings
watchEffect(() => {
  const oldState = [...state.value];
  const newState = sheets.value.map((sheet, i) => makeStateEntry(i, sheet.defaultValue));
  if (!isJsonEqual(oldState, newState)) {
    state.value = newState;
  }
});

function isValidOption(sheet: PlDataTableSheet, value: string | number): boolean {
  return sheet.options.some((option) => option.value === value);
}

function makeStateEntry(i: number, value: string | number): PlDataTableSheetState {
  const axisId = sheets.value[i].axisId;
  return {
    axisId,
    value,
  };
}

function onSheetChanged(i: number, newValue: string | number): void {
  const oldState = [...state.value];
  const stateEntry = makeStateEntry(i, newValue);
  if (!isJsonEqual(oldState[i], stateEntry)) {
    const newState = [...oldState];
    newState[i] = stateEntry;
    state.value = newState;
  }
}
</script>

<template>
  <div
    v-if="$slots['before'] || sheets.length > 0 || $slots['after']"
    :class="$style.container"
  >
    <slot name="before" />
    <PlDropdownLine
      v-for="(sheet, i) in sheets"
      :key="i"
      :model-value="state[i].value"
      :options="sheet.options"
      :prefix="sheet.prefix"
      @update:model-value="(newValue: string | number) => onSheetChanged(i, newValue)"
    />
    <slot name="after" />
  </div>
</template>

<style lang="css" module>
.container {
  display: flex;
  flex-direction: row;
  gap: 12px;
  flex-wrap: wrap;
  z-index: 3;
}
</style>
