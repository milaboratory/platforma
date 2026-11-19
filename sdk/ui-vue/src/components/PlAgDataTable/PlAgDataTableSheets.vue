<script lang="ts" setup>
import { PlDropdownLine } from "@milaboratories/uikit";
import type { PlDataTableSheet, PlDataTableSheetState } from "@platforma-sdk/model";
import { getAxisId } from "@platforma-sdk/model";
import { computed } from "vue";
import { isJsonEqual } from "@milaboratories/helpers";
import type { PlDataTableSheetNormalized } from "./types";

const props = defineProps<{
  /** Sheets of the source on screen */
  sheets: PlDataTableSheet[];
  /** Value picked on each sheet that has options, in the same order */
  state: PlDataTableSheetState[];
  onChange: (state: PlDataTableSheetState[]) => void;
}>();

// Sheets without options are not shown
const sheets = computed<PlDataTableSheetNormalized[]>(() =>
  props.sheets
    .filter((sheet) => sheet.options.length > 0)
    .map((sheet, i) => ({
      axisId: getAxisId(sheet.axis),
      prefix: (sheet.axis.annotations?.["pl7.app/label"]?.trim() ?? `Unlabeled axis ${i}`) + ":",
      options: sheet.options,
    })),
);

function onSheetChanged(i: number, value: string | number): void {
  if (props.state[i]?.value === value) return;
  const axisId = sheets.value[i].axisId;
  props.onChange([
    ...props.state.filter((sheet) => !isJsonEqual(sheet.axisId, axisId)),
    { axisId, value },
  ]);
}
</script>

<template>
  <div
    v-if="$slots['before'] || sheets.length > 0 || $slots['after']"
    data-testid="pl-ag-data-table-sheets"
    :class="$style.container"
  >
    <slot name="before" />
    <template v-for="(sheet, i) in sheets" :key="i">
      <PlDropdownLine
        v-if="state[i]"
        data-testid="pl-ag-data-table-sheets-dropdown"
        :model-value="state[i].value"
        :options="sheet.options"
        :prefix="sheet.prefix"
        @update:model-value="(value: string | number) => onSheetChanged(i, value)"
      />
    </template>
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
