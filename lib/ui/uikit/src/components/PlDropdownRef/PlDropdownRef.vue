<script lang="ts">
/**
 * A component for selecting one value from a list of options
 */
export default {
  name: 'PlDropdownRef',
};
</script>

<script lang="ts" setup>
import type { ModelRef, RefOption } from '../../types';
import { PlDropdown } from '../PlDropdown';
import { computed, useSlots } from 'vue';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const slots: any = useSlots();

defineEmits<{
  /**
   * Emitted when the model value is updated.
   */
  (e: 'update:modelValue', value: ModelRef | undefined): void;
}>();

const props = withDefaults(
  defineProps<{
    /**
     * The current selected ref of the dropdown.
     */
    modelValue: ModelRef | undefined;
    /**
     * The label text for the dropdown field (optional)
     */
    label?: string;
    /**
     * List of available ref options for the dropdown
     */
    options?: Readonly<RefOption[]>;
    /**
     * A helper text displayed below the dropdown when there are no errors (optional).
     */
    helper?: string;
    /**
     * A helper text displayed below the dropdown when there are no options yet or options is undefined (optional).
     */
    loadingOptionsHelper?: string;
    /**
     * Error message displayed below the dropdown (optional)
     */
    error?: string;
    /**
     * Placeholder text shown when no value is selected.
     */
    placeholder?: string;
    /**
     * Enables a button to clear the selected value (default: false)
     */
    clearable?: boolean;
    /**
     * If `true`, the dropdown component is marked as required.
     */
    required?: boolean;
    /**
     * If `true`, the dropdown component is disabled and cannot be interacted with.
     */
    disabled?: boolean;
    /**
     * Option list item size
     */
    optionSize?: 'small' | 'medium';
  }>(),
  {
    label: '',
    helper: undefined,
    loadingOptionsHelper: undefined,
    error: undefined,
    placeholder: '...',
    clearable: false,
    required: false,
    disabled: false,
    arrowIcon: undefined,
    optionSize: 'small',
    options: undefined,
  },
);

const options = computed(() =>
  props.options?.map((opt) => ({
    label: opt.label,
    value: opt.ref,
  })),
);

const arrowIcon = computed(() => (props.disabled ? 'icon-link-disabled' : 'icon-link'));
</script>

<template>
  <PlDropdown
    v-bind="props"
    :options="options"
    :loading-options-helper="loadingOptionsHelper"
    :arrow-icon-large="arrowIcon"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <template v-if="slots.tooltip" #tooltip>
      <slot name="tooltip" />
    </template>
  </PlDropdown>
</template>
