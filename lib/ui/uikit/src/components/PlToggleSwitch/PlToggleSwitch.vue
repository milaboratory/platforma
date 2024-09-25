<script lang="ts">
/**
 * Component for manipulating a boolean value
 */
export default {
  name: 'PlToggleSwitch',
};
</script>

<script lang="ts" setup>
import './pl-toggle-switch.scss';

defineEmits<{
  /**
   * Emitted when the model value is updated
   *
   * @param value - The new boolean value of the model
   */
  (e: 'update:modelValue', value: boolean): void;
}>();

defineProps<{
  /**
   * The label text for the component (optional)
   */
  label?: string;
  /**
   * The current boolean value of the component (represents 'on' | 'off' states generally).
   */
  modelValue?: boolean;
}>();
</script>

<template>
  <div
    tabindex="0"
    class="ui-toggle-switch"
    :class="{ active: modelValue }"
    @click="$emit('update:modelValue', !modelValue)"
    @keydown.enter="$emit('update:modelValue', !modelValue)"
  >
    <div class="ui-toggle-switch__body">
      <div class="ui-toggle-switch__handle" />
    </div>
    <span v-if="label" class="label">{{ label }}</span>
  </div>
</template>
