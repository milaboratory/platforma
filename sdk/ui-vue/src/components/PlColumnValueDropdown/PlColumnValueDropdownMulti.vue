<script lang="ts" setup>
import type {
  ColumnUniversalId,
  ColumnValueId,
  ColumnValueOptionsModel,
} from "@platforma-sdk/model";
import { computed } from "vue";
import { usePlColumnValueOptions } from "../../composition/usePlColumnValueOptions";
import { PlDropdownMulti } from "../ValuePickers";

/**
 * `PlDropdownMulti` over the values of a column, read through the model a block output gives
 * (`createColumnValueOptions`). Loading until the values are read; a column that is gone or cannot
 * be read offers none and tells why, and its picks stay picked and are shown as not available.
 * Other attributes and the slots go to `PlDropdownMulti`.
 */
defineOptions({ inheritAttrs: false });

const props = defineProps<{
  /** The block output made by `createColumnValueOptions`. */
  source: ColumnValueOptionsModel | undefined;
  /** The column picked now, so that the values of an earlier pick are not offered for it. */
  valueColumn?: ColumnUniversalId;
  modelValue?: ColumnValueId[];
  "onUpdate:modelValue"?: (value: ColumnValueId[]) => void;
  /** Values not offered, such as those another picker holds. */
  exclude?: readonly ColumnValueId[];
  /** Shown in place of the reason the column offers no values. */
  error?: string;
}>();

const values = usePlColumnValueOptions({
  source: () => props.source,
  valueColumn: () => props.valueColumn ?? props.source?.valueColumn,
});

const options = computed(() =>
  values.options.value?.filter((option) => !props.exclude?.includes(option.value)),
);

function update(value: ColumnValueId[]) {
  props["onUpdate:modelValue"]?.(value);
}
</script>

<template>
  <PlDropdownMulti
    v-bind="$attrs"
    :model-value="modelValue ?? []"
    :options="options"
    :error="error ?? values.error.value"
    @update:model-value="update"
  >
    <template v-for="(_, name) in $slots" #[name]="slotProps">
      <slot :name="name" v-bind="slotProps ?? {}" />
    </template>
  </PlDropdownMulti>
</template>
