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
import type { SimpleOption } from '../../types';
import PlCheckboxBase from '../../components/PlCheckbox/PlCheckboxBase.vue';
import { PlTooltip } from '../PlTooltip';
import { useSlots } from 'vue';

const slots = useSlots();

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
  options: Readonly<SimpleOption<M>[]>;
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
  <div class="pl-checkbox-group" :class="{ disabled }">
    <label v-if="label">
      <span>{{ label }}</span>
      <PlTooltip v-if="slots.tooltip" class="info" position="top">
        <template #tooltip>
          <slot name="tooltip" />
        </template>
      </PlTooltip>
    </label>
    <div v-for="(opt, i) in options.map((it) => ({ label: 'label' in it ? it.label : it.text, value: it.value }))" :key="i">
      <PlCheckboxBase :disabled="disabled" :label="opt.label" :model-value="hasValue(opt.value)" @update:model-value="() => updateModel(opt.value)" />
      <label @click.stop="() => updateModel(opt.value)">{{ opt.label }}</label>
    </div>
  </div>
</template>
