<script lang="ts">
/** Component for boolean model manipulation */
export default {
  name: 'PlCheckbox',
};
</script>

<script lang="ts" setup>
import { useSlots } from 'vue';
import './pl-checkbox.scss';
import PlCheckboxBase from './PlCheckboxBase.vue';

defineEmits<{
  /**
   * Emitted when the model value is updated.
   */
  (e: 'update:modelValue', value: boolean): void;
}>();

const props = defineProps<{
  /**
   * The current boolean value of the checkbox.
   */
  modelValue: boolean;
  /**
   * If `true`, the checkbox is disabled and cannot be interacted with.
   */
  disabled?: boolean;
  /**
   * If `true`, the checkbox is indeterminate (doesn't affect the model value).
   */
  indeterminate?: boolean;
}>();

const slots = useSlots();
</script>

<template>
  <div v-if="slots['default']" class="pl-checkbox" :class="{ disabled }">
    <PlCheckboxBase v-bind="props" @update:model-value="$emit('update:modelValue', $event)" />
    <label @click="$emit('update:modelValue', !$props.modelValue)"><slot /></label>
  </div>
  <PlCheckboxBase v-else v-bind="props" @update:model-value="$emit('update:modelValue', $event)" />
</template>
