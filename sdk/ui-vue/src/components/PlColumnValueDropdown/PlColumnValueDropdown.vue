<script lang="ts" setup>
import type {
  ColumnUniversalId,
  ColumnValueId,
  ColumnValueOptionsModel,
} from "@platforma-sdk/model";
import { usePlColumnValueOptions } from "../../composition/usePlColumnValueOptions";
import { PlDropdown } from "../ValuePickers";

/**
 * `PlDropdown` over the values of a column, read through the model a block output gives
 * (`createColumnValueOptions`). Loading until the values are read; a column that is gone or cannot
 * be read offers none and tells why, and its pick stays picked and is shown as not available.
 * Other attributes go to `PlDropdown`.
 */
defineOptions({ inheritAttrs: false });

const props = defineProps<{
  /** The block output made by `createColumnValueOptions`. */
  source: ColumnValueOptionsModel | undefined;
  /** The column picked now, so that the values of an earlier pick are not offered for it. */
  valueColumn?: ColumnUniversalId;
  modelValue?: ColumnValueId;
  "onUpdate:modelValue"?: (value: ColumnValueId | undefined) => void;
  /** Shown in place of the reason the column offers no values. */
  error?: string;
}>();

const values = usePlColumnValueOptions({
  source: () => props.source,
  valueColumn: () => props.valueColumn ?? props.source?.valueColumn,
});

function update(value: ColumnValueId | undefined) {
  props["onUpdate:modelValue"]?.(value);
}
</script>

<template>
  <PlDropdown
    v-bind="$attrs"
    :model-value="modelValue"
    :options="values.options.value"
    :error="error ?? values.error.value"
    @update:model-value="update"
  />
</template>
