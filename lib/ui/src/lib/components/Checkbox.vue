<script lang="ts" setup>
import { UiCheckbox } from '@/lib';

defineEmits(['update:modelValue']);

const props = defineProps<{
  modelValue: boolean;
  disabled?: boolean;
}>();
</script>

<template>
  <div class="ui-checkbox-with-label" :class="{ disabled }">
    <UiCheckbox v-bind="props" @update:model-value="$emit('update:modelValue', $event)" />
    <label @click="$emit('update:modelValue', !$props.modelValue)"><slot /></label>
  </div>
</template>

<style lang="scss">
.ui-checkbox-with-label {
  --color-label: var(--color-text);
  --cursor-label: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  &.disabled {
    --color-label: var(--color-dis-01);
    --cursor-label: default;
    pointer-events: none;
  }
  > label {
    user-select: none;
    color: var(--color-label);
    cursor: var(--cursor-label);
    font-size: 14px;
    font-weight: 500;
  }
}
</style>
