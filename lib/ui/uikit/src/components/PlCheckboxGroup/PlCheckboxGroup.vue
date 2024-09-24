<script lang="ts">
/**
 * Component for selecting multiple values from a list of options
 */
export default {
  name: 'PlCheckboxGroup',
};
</script>

<script lang="ts" setup generic="M = unknown">
import './pl-checkbox-group.scss';
import type { SimpleOption } from '@/types';
import PlCheckboxBase from '@/components/PlCheckbox/PlCheckboxBase.vue';

const emit = defineEmits<{
  (e: 'update:modelValue', v: M[]): void;
}>();

const props = defineProps<{
  /**
   * The current selected values.
   */
  modelValue: M[];
  /**
   * The label text for the component (optional)
   */
  label?: string;
  /**
   * List of available options for the component
   */
  options: SimpleOption<M>[];
  /**
   * If `true`, the component is disabled and cannot be interacted with.
   */
  disabled?: boolean;
}>();

const hasValue = (value: M) => {
  return props.modelValue.includes(value);
};

const updateModel = (value: M) => {
  const values = props.modelValue ?? [];
  emit('update:modelValue', hasValue(value) ? values.filter((v) => v !== value) : [...values, value]);
};
</script>

<template>
  <div class="ui-checkbox-group" :class="{ disabled }">
    <label v-if="label">{{ label }}</label>
    <div v-for="(opt, i) in options" :key="i">
      <PlCheckboxBase :disabled="disabled" :label="opt.text" :model-value="hasValue(opt.value)" @update:model-value="() => updateModel(opt.value)" />
      <label @click.stop="() => updateModel(opt.value)">{{ opt.text }}</label>
    </div>
  </div>
</template>
