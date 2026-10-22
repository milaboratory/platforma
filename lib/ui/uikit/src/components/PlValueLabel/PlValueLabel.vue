<script lang="ts">
/**
 * A selected value shown as text, the way a dropdown shows it: by the label of its option, or,
 * for a column value id, by the value it picks. A value the options lack is marked as not
 * available, in error color, with the reason in a tooltip when there is a hint for it.
 */
export default {
  name: "PlValueLabel",
};
</script>

<script lang="ts" setup generic="M = unknown">
import { computed } from "vue";
import { missingValueText, missingValueTooltip, pickedValueText } from "../../helpers/columnValue";
import type { MissingValueLabel, MissingValueTooltip } from "../../helpers/columnValue";
import { deepEqual } from "../../helpers/objects";
import { normalizeListOptions } from "../../helpers/utils";
import type { ListOption } from "../../types";
import { PlTooltip } from "../PlTooltip";

const props = defineProps<{
  /** The value to show. */
  value: M;
  /**
   * Options the value is picked from. While they are `undefined` — not loaded yet — the value
   * is never marked as not available.
   */
  options?: Readonly<ListOption<M>[]>;
  /**
   * Text shown when the options lack the value: one text, or a function giving it per value. By
   * default, the value a column value id picks, marked as not available, or "Value not
   * available".
   */
  missingValueLabel?: MissingValueLabel;
  /**
   * Explains the value in a tooltip over it while the options lack it: one text, or a function
   * giving the content per value.
   */
  missingValueTooltip?: MissingValueTooltip;
}>();

const option = computed(() =>
  props.options === undefined
    ? undefined
    : normalizeListOptions(props.options).find((o) => deepEqual(o.value, props.value)),
);

const isMissing = computed(() => props.options !== undefined && option.value === undefined);

const hint = computed(() =>
  isMissing.value ? missingValueTooltip(props.value, props.missingValueTooltip) : undefined,
);

const text = computed(() => {
  if (option.value !== undefined) return option.value.label;
  if (isMissing.value) {
    return missingValueText(props.value, props.missingValueLabel);
  }
  return pickedValueText(props.value) ?? String(props.value);
});
</script>

<template>
  <PlTooltip v-if="hint !== undefined" element="span" position="top">
    <span :class="$style.missing" data-testid="pl-value-label">{{ text }}</span>
    <template #tooltip>
      <component :is="hint" />
    </template>
  </PlTooltip>
  <span v-else :class="{ [$style.missing]: isMissing }" data-testid="pl-value-label">{{
    text
  }}</span>
</template>

<style module>
.missing {
  font-style: italic;
  color: var(--txt-error);
}
</style>
