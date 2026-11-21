<script lang="ts" setup>
import { PlDropdownLine, PlDropdownMulti, type ListOption } from "@milaboratories/uikit";
import type { PlDataTableSheet, PlDataTableSheetState } from "@platforma-sdk/model";
import { getAxisId } from "@platforma-sdk/model";
import { computed } from "vue";
import { isJsonEqual } from "@milaboratories/helpers";
import type { PlDataTableSheetNormalized } from "./types";

const props = defineProps<{
  /** Sheets of the source on screen */
  sheets: PlDataTableSheet[];
  /** Values picked on each sheet that has options */
  state: PlDataTableSheetState[];
  onChange: (state: PlDataTableSheetState[]) => void;
}>();

/** An entry of a sheet's multiple choice: every value of the sheet, or one of them. */
type SheetChoice = { type: "all" } | { type: "value"; value: string | number };

type SheetView = PlDataTableSheetNormalized &
  (
    | { selection: "single"; value: string | number }
    | {
        selection: "multiple";
        label: string;
        choices: SheetChoice[];
        choiceOptions: ListOption<SheetChoice>[];
      }
  );

// Sheets without options are not shown
const views = computed<SheetView[]>(() =>
  props.sheets
    .filter((sheet) => sheet.options.length > 0)
    .flatMap((sheet, i): SheetView[] => {
      const axisId = getAxisId(sheet.axis);
      const state = props.state.find((s) => isJsonEqual(s.axisId, axisId));
      if (state === undefined) return [];
      const label = sheet.axis.annotations?.["pl7.app/label"]?.trim() ?? `Unlabeled axis ${i}`;
      const base: PlDataTableSheetNormalized = {
        axisId,
        prefix: label + ":",
        options: sheet.options,
      };
      if (sheet.selection === "single") {
        return "value" in state ? [{ ...base, selection: "single", value: state.value }] : [];
      }
      return [
        {
          ...base,
          selection: "multiple",
          label,
          choices: toChoices(state),
          choiceOptions: [
            { value: { type: "all" }, label: "All" },
            ...sheet.options.map((option): ListOption<SheetChoice> => ({
              value: { type: "value", value: option.value },
              label: option.label,
            })),
          ],
        },
      ];
    }),
);

function onValueChanged(axisId: PlDataTableSheetNormalized["axisId"], value: string | number) {
  change({ axisId, value });
}

/**
 * "All" excludes the single values: picking it drops them, and picking a value
 * while "All" is on keeps only the values.
 */
function onChoicesChanged(
  axisId: PlDataTableSheetNormalized["axisId"],
  current: SheetChoice[],
  next: SheetChoice[],
) {
  const picksAll = next.some((c) => c.type === "all");
  const hadAll = current.some((c) => c.type === "all");
  const values = next.flatMap((c) => (c.type === "value" ? [c.value] : []));
  change(
    picksAll && (!hadAll || values.length === 0) ? { axisId, allValues: true } : { axisId, values },
  );
}

function change(next: PlDataTableSheetState): void {
  const current = props.state.find((s) => isJsonEqual(s.axisId, next.axisId));
  if (isJsonEqual(current, next)) return;
  props.onChange([...props.state.filter((s) => !isJsonEqual(s.axisId, next.axisId)), next]);
}

function toChoices(state: PlDataTableSheetState): SheetChoice[] {
  if ("value" in state) return [{ type: "value", value: state.value }];
  if ("allValues" in state) return [{ type: "all" }];
  return state.values.map((value) => ({ type: "value", value }));
}
</script>

<template>
  <div
    v-if="$slots['before'] || views.length > 0 || $slots['after']"
    data-testid="pl-ag-data-table-sheets"
    :class="$style.container"
  >
    <slot name="before" />
    <template v-for="(view, i) in views" :key="i">
      <PlDropdownMulti
        v-if="view.selection === 'multiple'"
        data-testid="pl-ag-data-table-sheets-dropdown-multi"
        :model-value="view.choices"
        :options="view.choiceOptions"
        :label="view.label"
        @update:model-value="
          (next: SheetChoice[]) => onChoicesChanged(view.axisId, view.choices, next)
        "
      />
      <PlDropdownLine
        v-else
        data-testid="pl-ag-data-table-sheets-dropdown"
        :model-value="view.value"
        :options="view.options"
        :prefix="view.prefix"
        @update:model-value="(value: string | number) => onValueChanged(view.axisId, value)"
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
