<script lang="ts" setup>
import type { ColumnValueId } from "@platforma-sdk/model";
import { computed } from "vue";
import { PlDropdown } from "../ValuePickers";
import type { PlColumnValueSettings } from "./settings";
import { useColumnValueOptions } from "./useColumnValueOptions";

/**
 * `PlDropdown` over the values of a column, as its settings (`usePlColumnValueSettings`) give
 * them. Loading until the values are read; a column that is gone or cannot
 * be read offers none and tells why, and its pick stays picked and is shown as not available.
 * Other attributes and the slots go to `PlDropdown`.
 */
defineOptions({ inheritAttrs: false });

const props = defineProps<{
  /** What to offer, made by `usePlColumnValueSettings`. */
  settings: PlColumnValueSettings;
  modelValue?: ColumnValueId;
  "onUpdate:modelValue"?: (value: ColumnValueId | undefined) => void;
  /** Values not offered, such as those another picker holds. */
  exclude?: readonly ColumnValueId[];
  /** Shown in place of the reason the column offers no values. */
  error?: string;
}>();

const values = useColumnValueOptions(() => props.settings);

const options = computed(() =>
  values.options.value?.filter((option) => !props.exclude?.includes(option.value)),
);

function update(value: ColumnValueId | undefined) {
  props["onUpdate:modelValue"]?.(value);
}
</script>

<template>
  <PlDropdown
    v-bind="$attrs"
    :model-value="modelValue"
    :options="options"
    :error="error ?? values.error.value"
    @update:model-value="update"
  >
    <template v-for="(_, name) in $slots" #[name]="slotProps">
      <slot :name="name" v-bind="slotProps ?? {}" />
    </template>
  </PlDropdown>
</template>
