<script lang="ts" setup>
import type { ModelRef, RefOption } from '@/types';
import PlDropdownMulti from '../PlDropdownMulti/PlDropdownMulti.vue';
import { computed } from 'vue';

defineEmits<{
  /**
   * Emitted when the model value is updated.
   */
  (e: 'update:modelValue', value: ModelRef[] | undefined): void;
}>();

const props = withDefaults(
  defineProps<{
    /**
     * The current selected values.
     */
    modelValue: ModelRef[] | undefined;
    /**
     * The label text for the dropdown field (optional)
     */
    label?: string;
    /**
     * List of available options for the dropdown
     */
    options?: Readonly<RefOption[]>;
    /**
     * A helper text displayed below the dropdown when there are no errors (optional).
     */
    helper?: string;
    /**
     * Error message displayed below the dropdown (optional)
     */
    error?: string;
    /**
     * Placeholder text shown when no value is selected.
     */
    placeholder?: string;
    /**
     * If `true`, the dropdown component is marked as required.
     */
    required?: boolean;
    /**
     * If `true`, the dropdown component is disabled and cannot be interacted with.
     */
    disabled?: boolean;
  }>(),
  {
    modelValue: () => [],
    label: undefined,
    helper: undefined,
    error: undefined,
    placeholder: '...',
    required: false,
    disabled: false,
    options: undefined,
  },
);

const options = computed(() =>
  props.options?.map((opt) => ({
    label: opt.label,
    value: opt.ref,
  })),
);
</script>

<template>
  <PlDropdownMulti
    v-bind="props"
    :options="options"
    @update:model-value="$emit('update:modelValue', $event)"
  />
</template>
